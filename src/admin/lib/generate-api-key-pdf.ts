import { jsPDF } from 'jspdf';

interface BrandingConfig {
  primaryColor: string;
  logoLightUrl: string | null;
  logoDarkUrl: string | null;
  iconLightUrl: string | null;
  iconDarkUrl: string | null;
}

interface ApiKeyPdfData {
  projectName: string;
  apiKey: string;
  serverUrl: string;
  branding?: BrandingConfig;
}

/**
 * Convert hex color to RGB values
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  hex = hex.replace(/^#/, '');
  return {
    r: parseInt(hex.substring(0, 2), 16),
    g: parseInt(hex.substring(2, 4), 16),
    b: parseInt(hex.substring(4, 6), 16),
  };
}

/**
 * Parse SVG viewBox to get dimensions
 */
function parseSvgDimensions(svgText: string): { width: number; height: number } | null {
  // Try to get viewBox first
  const viewBoxMatch = svgText.match(/viewBox=["']([^"']+)["']/);
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].split(/[\s,]+/).map(Number);
    if (parts.length >= 4) {
      return { width: parts[2], height: parts[3] };
    }
  }

  // Try to get width/height attributes
  const widthMatch = svgText.match(/width=["']([^"']+)["']/);
  const heightMatch = svgText.match(/height=["']([^"']+)["']/);
  if (widthMatch && heightMatch) {
    const width = parseFloat(widthMatch[1]);
    const height = parseFloat(heightMatch[1]);
    if (!isNaN(width) && !isNaN(height)) {
      return { width, height };
    }
  }

  return null;
}

/**
 * Convert SVG to PNG data URL using canvas
 * Fetches the SVG content and inlines it to avoid CORS issues
 * Preserves the SVG's aspect ratio
 */
async function svgToPng(
  svgUrl: string,
  targetHeight: number,
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    // Fetch the SVG content
    const response = await fetch(svgUrl);
    if (!response.ok) return null;

    const svgText = await response.text();

    // Parse the SVG dimensions to preserve aspect ratio
    const dimensions = parseSvgDimensions(svgText);
    if (!dimensions) return null;

    // Calculate canvas size based on aspect ratio and target height
    const aspectRatio = dimensions.width / dimensions.height;
    const canvasHeight = targetHeight;
    const canvasWidth = Math.round(targetHeight * aspectRatio);

    // Create a data URL from the SVG content
    const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const svgDataUrl = URL.createObjectURL(svgBlob);

    return new Promise((resolve) => {
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(svgDataUrl);
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
        URL.revokeObjectURL(svgDataUrl);
        resolve({
          dataUrl: canvas.toDataURL('image/png'),
          width: canvasWidth,
          height: canvasHeight,
        });
      };

      img.onerror = () => {
        URL.revokeObjectURL(svgDataUrl);
        resolve(null);
      };

      img.src = svgDataUrl;
    });
  } catch {
    return null;
  }
}

interface ImageData {
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * Fetch an image and convert to base64 data URL
 * Handles SVG by converting to PNG via canvas
 * Returns image data including dimensions
 */
async function fetchImageAsBase64(url: string): Promise<ImageData | null> {
  try {
    const isSvg = url.toLowerCase().endsWith('.svg');

    if (isSvg) {
      // For SVG, convert to PNG via canvas at higher resolution (100px height)
      const result = await svgToPng(url, 100);
      return result;
    }

    const response = await fetch(url);
    if (!response.ok) return null;

    const blob = await response.blob();
    const dataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });

    if (!dataUrl) return null;

    // Get dimensions for raster images
    const dimensions = await getImageDimensions(dataUrl);
    if (!dimensions) return null;

    return {
      dataUrl,
      width: dimensions.width,
      height: dimensions.height,
    };
  } catch {
    return null;
  }
}

/**
 * Get image dimensions from base64 data URL
 */
async function getImageDimensions(
  dataUrl: string,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

export async function generateApiKeyPdf(data: ApiKeyPdfData): Promise<void> {
  const { projectName, apiKey, serverUrl, branding } = data;
  const doc = new jsPDF();

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // Use branding colors or defaults
  const primaryColor = branding?.primaryColor
    ? hexToRgb(branding.primaryColor)
    : { r: 2, g: 101, b: 141 }; // Default #02658D

  // Header with light background and colored accent line
  doc.setFillColor(250, 250, 250);
  doc.rect(0, 0, pageWidth, 40, 'F');
  // Add colored accent line at bottom of header
  doc.setFillColor(primaryColor.r, primaryColor.g, primaryColor.b);
  doc.rect(0, 38, pageWidth, 2, 'F');

  // Try to add logo/icon to header (use light variant for light header background)
  let logoAdded = false;
  // Use custom light logo/icon if available, otherwise fall back to default light logo
  const logoUrl =
    branding?.iconLightUrl || branding?.logoLightUrl || '/branding/light/logo-light.svg';

  if (logoUrl) {
    const fullLogoUrl = logoUrl.startsWith('http') ? logoUrl : `${serverUrl}${logoUrl}`;
    const imageData = await fetchImageAsBase64(fullLogoUrl);

    if (imageData) {
      // Calculate logo size to fit in header (max height 18px)
      const maxHeight = 18;
      const aspectRatio = imageData.width / imageData.height;
      const logoHeight = maxHeight;
      const logoWidth = logoHeight * aspectRatio;

      try {
        // Determine format from data URL (SVGs are converted to PNG)
        let format: 'PNG' | 'JPEG' = 'PNG';
        if (imageData.dataUrl.includes('image/jpeg') || imageData.dataUrl.includes('image/jpg')) {
          format = 'JPEG';
        }
        doc.addImage(imageData.dataUrl, format, margin, 11, logoWidth, logoHeight);
        logoAdded = true;
      } catch {
        // If adding image fails, fall back to text
      }
    }
  }

  // Add text "BugPin" if no logo was added
  if (!logoAdded) {
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('BugPin', margin, 28);
  }

  doc.setTextColor(80, 80, 80);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('API Key Credentials', pageWidth - margin - 60, 26);

  y = 55;

  // Project name
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(10);
  doc.text('PROJECT', margin, y);
  y += 6;

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(projectName, margin, y);
  y += 15;

  // Warning box
  doc.setFillColor(255, 243, 224); // Light amber
  doc.setDrawColor(245, 158, 11); // Amber border
  doc.roundedRect(margin, y, contentWidth, 25, 3, 3, 'FD');

  doc.setTextColor(180, 83, 9); // Amber text
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('IMPORTANT: Keep this document secure', margin + 5, y + 10);
  doc.setFont('helvetica', 'normal');
  doc.text(
    'This API key provides access to your BugPin project. Do not share it publicly.',
    margin + 5,
    y + 18,
  );
  y += 35;

  // API Key section
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('API KEY', margin, y);
  y += 6;

  doc.setFillColor(245, 245, 245);
  doc.roundedRect(margin, y, contentWidth, 12, 2, 2, 'F');

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.setFont('courier', 'normal');
  doc.text(apiKey, margin + 4, y + 8);
  y += 22;

  // Widget Snippet section
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('WIDGET SNIPPET', margin, y);
  y += 6;

  const snippet = `<!-- Start of BugPin Widget -->
<script src="${serverUrl}/widget.js"
  data-api-key="${apiKey}">
</script>
<!-- End of BugPin Widget -->`;

  doc.setFillColor(245, 245, 245);
  doc.roundedRect(margin, y, contentWidth, 35, 2, 2, 'F');

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);
  doc.setFont('courier', 'normal');
  const snippetLines = snippet.split('\n');
  snippetLines.forEach((line, i) => {
    doc.text(line, margin + 4, y + 7 + i * 6);
  });
  y += 45;

  // Setup Instructions
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('SETUP INSTRUCTIONS', margin, y);
  y += 8;

  doc.setTextColor(50, 50, 50);
  doc.setFontSize(10);
  const instructions = [
    '1. Copy the widget snippet above',
    "2. Paste it into your website's HTML, just before the closing </body> tag",
    '3. The BugPin widget will appear on your website',
    '4. Users can click the widget to report bugs with screenshots',
  ];

  instructions.forEach((instruction) => {
    doc.text(instruction, margin, y);
    y += 7;
  });
  y += 8;

  // Documentation link
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(10);
  doc.text('DOCUMENTATION', margin, y);
  y += 6;

  doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
  doc.setFont('helvetica', 'normal');
  doc.textWithLink('https://docs.bugpin.io/widget/installation', margin, y, {
    url: 'https://docs.bugpin.io/widget/installation',
  });
  y += 10;

  doc.setTextColor(100, 100, 100);
  doc.setFontSize(9);
  doc.text('For advanced integration options, custom triggers, and API reference.', margin, y);

  // Footer (matching app footer style)
  const footerY = doc.internal.pageSize.getHeight() - 12;
  doc.setDrawColor(220, 220, 220);
  doc.line(margin, footerY - 6, pageWidth - margin, footerY - 6);

  const currentYear = new Date().getFullYear();
  doc.setFontSize(9);

  // Calculate centered position for "© 2026 Arantic Digital | GitHub"
  const copyrightText = `© ${currentYear} Arantic Digital  |  `;
  const githubText = 'GitHub';
  const copyrightWidth = doc.getTextWidth(copyrightText);
  const githubWidth = doc.getTextWidth(githubText);
  const totalWidth = copyrightWidth + githubWidth;
  const startX = (pageWidth - totalWidth) / 2;

  doc.setTextColor(150, 150, 150);
  doc.text(copyrightText, startX, footerY);

  doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
  doc.textWithLink(githubText, startX + copyrightWidth, footerY, {
    url: 'https://github.com/aranticlabs/bugpin',
  });

  // Save the PDF
  const filename = `bugpin-api-key-${projectName.toLowerCase().replace(/\s+/g, '-')}.pdf`;
  doc.save(filename);
}
