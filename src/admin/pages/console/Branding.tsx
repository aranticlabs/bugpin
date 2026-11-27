import { useQuery } from '@tanstack/react-query';
import { licenseApi } from '../../api/license';
import { Card, CardContent } from '../../components/ui/card';
import { Spinner } from '../../components/ui/spinner';
import { UpgradePrompt } from '../../components/UpgradePrompt';
import { BrandColorSection } from '../../components/branding/BrandColorSection';
import { IconSection } from '../../components/branding/IconSection';
import { LogoSection } from '../../components/branding/LogoSection';
import { FaviconSection } from '../../components/branding/FaviconSection';

export function Branding() {
  const { data: featureStatus, isLoading } = useQuery({
    queryKey: ['license-features'],
    queryFn: licenseApi.getFeatures,
  });

  const isLicensed = featureStatus?.features?.['custom-branding'] ?? false;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12">
          <Spinner className="mx-auto text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {isLicensed ? (
        <>
          <BrandColorSection />
          <IconSection />
          <LogoSection />
          <FaviconSection />
        </>
      ) : (
        <UpgradePrompt
          title="Custom Branding"
          description="Customize your BugPin instance with your own logo, icon, favicon, and brand colors. Make it truly yours."
        />
      )}
    </div>
  );
}
