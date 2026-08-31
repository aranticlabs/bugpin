# BugPin Widget

Embeddable visual bug reporting widget for web applications. Capture screenshots, annotate issues, and submit bug reports with ease.

## Features

- **Screenshot Capture** - Full page or visible area
- **Annotation Tools** - Draw, highlight, blur, and add text
- **Privacy First** - Self-hosted, your data stays on your servers
- **Customizable** - Match your brand colors and style
- **Lightweight** - Less than 175KB gzipped
- **Dark Mode** - Automatic theme detection
- **Responsive** - Works on all devices
- **Multilingual** - Translated into 8 languages (English, German, French, Dutch, Spanish, Italian, Japanese, Simplified Chinese) with automatic detection from `<html lang>` or the visitor's browser
- **Framework Agnostic** - Works with React, Vue, Angular, Svelte, .NET, and more

## Installation

```bash
npm install @arantic/bugpin-widget
```

## Usage

```javascript
import BugPin from '@arantic/bugpin-widget';

BugPin.init({
  apiKey: 'your-project-api-key',
  serverUrl: 'https://your-bugpin-server.com',
});
```

## Configuration

The widget automatically fetches its configuration from the BugPin server based on your API key. All visual settings (theme, position, colors, button text) are managed in the BugPin Admin Console.

### Required Options

| Option      | Type     | Description                              |
| ----------- | -------- | ---------------------------------------- |
| `apiKey`    | `string` | Your project API key (from BugPin admin) |
| `serverUrl` | `string` | Your BugPin server URL                   |

### Optional Options

| Option          | Type     | Description                                                                                                                     |
| --------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `language`      | `string` | BCP 47 language code (e.g. `en`, `de`, `fr`, `nl`, `es`, `it`, `ja`, `zh`). Overrides auto-detection and the project's default. |
| `reporterName`  | `string` | Prefills the editable reporter name field.                                                                                      |
| `reporterEmail` | `string` | Prefills the editable reporter email field.                                                                                     |

### Prefill Reporter Details

Pass the current user's details when initializing the widget:

```javascript
BugPin.init({
  apiKey: 'your-project-api-key',
  serverUrl: 'https://your-bugpin-server.com',
  reporterName: currentUser.name,
  reporterEmail: currentUser.email,
});
```

For automatic script-tag initialization, use the equivalent attributes:

```html
<script
  src="https://your-bugpin-server.com/widget.js"
  data-api-key="your-project-api-key"
  data-reporter-name="{{ currentUser.name }}"
  data-reporter-email="{{ currentUser.email }}"
></script>
```

The host application remains responsible for supplying the logged-in user's values. Both fields
remain editable in the report form.

## Privacy and diagnostic capture

The server controls which diagnostic categories the widget may collect. EU Privacy Mode disables
the user activity trail for every project, with no project override. When EU Privacy Mode is off,
the activity trail remains available automatically unless the project disables it. Console output,
network failures, and storage-key names remain independent project controls; storage-key capture is
off by default.

The activity trail records at most 30 recent interactions with buttons, links, inputs, selects,
checkboxes, and similar controls. It does not record keystrokes or typed values. Common personal
data and token patterns are redacted before entering the in-memory buffer.

Mark sensitive parts of an embedded website with `data-bugpin-private`. BugPin ignores activity
inside the marked element and all of its descendants:

```html
<section data-bugpin-private>
  <!-- Account, payment, health, or other sensitive UI -->
</section>
```

Activity remains in page memory until it is submitted with a report or cleared. When EU Privacy
Mode or the project activity setting disables capture, the widget does not install the activity
listener and clears the activity buffer.

Diagnostic capture is fail-closed and server-controlled:

- Console and network capture start only after the widget config has been fetched. Errors that
  occur before the widget initializes are not captured. If the config request fails, all
  diagnostic capture stays disabled for the session.
- The capture flags cannot be overridden through local `BugPin.init()` options; they are always
  resolved from the server configuration so instance and project privacy settings take precedence.

## Language

The widget ships with translations for English, German, French, Dutch, Spanish, Italian, Japanese, and Simplified Chinese.

By default, the active language is resolved in this order:

1. `language` passed to `BugPin.init()`
2. `data-language` attribute on the script tag (when loaded via `<script>`)
3. The `lang` attribute on `<html>` (the widget watches for changes and re-renders)
4. The visitor's browser language
5. The project's default language (configured in the Admin Console)

```javascript
BugPin.init({
  apiKey: 'your-project-api-key',
  serverUrl: 'https://your-bugpin-server.com',
  language: 'de',
});
```

Switch the language at runtime, for example when your app's locale changes:

```javascript
BugPin.setLanguage('fr'); // returns the resolved locale, or null if unsupported
BugPin.getLanguage(); // returns the currently active locale
```

## Framework Examples

### React / Vite

```jsx
import { useEffect } from 'react';
import BugPin from '@arantic/bugpin-widget';

function App() {
  useEffect(() => {
    BugPin.init({
      apiKey: import.meta.env.VITE_BUGPIN_API_KEY,
      serverUrl: import.meta.env.VITE_BUGPIN_SERVER_URL,
    });
  }, []);

  return <div>Your app</div>;
}
```

### Next.js

```jsx
import { useEffect } from 'react';
import BugPin from '@arantic/bugpin-widget';

function App() {
  useEffect(() => {
    BugPin.init({
      apiKey: process.env.NEXT_PUBLIC_BUGPIN_API_KEY,
      serverUrl: process.env.NEXT_PUBLIC_BUGPIN_SERVER_URL,
    });
  }, []);

  return <div>Your app</div>;
}
```

### Vue / Nuxt

```vue
<script setup>
import { onMounted } from 'vue';
import BugPin from '@arantic/bugpin-widget';

onMounted(() => {
  BugPin.init({
    apiKey: import.meta.env.VITE_BUGPIN_API_KEY,
    serverUrl: import.meta.env.VITE_BUGPIN_SERVER_URL,
  });
});
</script>
```

### Angular

```typescript
// app.component.ts
import { Component, OnInit } from '@angular/core';
import BugPin from '@arantic/bugpin-widget';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit {
  ngOnInit() {
    BugPin.init({
      apiKey: environment.bugpinApiKey,
      serverUrl: environment.bugpinServerUrl,
    });
  }
}
```

### TypeScript / Vanilla JavaScript

```typescript
import BugPin from '@arantic/bugpin-widget';

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  BugPin.init({
    apiKey: 'your-api-key',
    serverUrl: 'https://bugpin.example.com',
  });
});
```

### .NET / Blazor

```csharp
// Services/BugPinService.cs
public class BugPinService
{
    private readonly IJSRuntime _js;

    public BugPinService(IJSRuntime js) => _js = js;

    public async Task InitializeAsync(string apiKey, string serverUrl)
    {
        await _js.InvokeVoidAsync("eval",
            $"import('@arantic/bugpin-widget').then(m => m.default.init({{apiKey: '{apiKey}', serverUrl: '{serverUrl}'}}))");
    }
}
```

```csharp
// Program.cs or Startup.cs
builder.Services.AddScoped<BugPinService>();
```

```razor
@inject BugPinService BugPin
@inject IConfiguration Config

@code {
    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (firstRender)
        {
            await BugPin.InitializeAsync(
                Config["BugPin:ApiKey"],
                Config["BugPin:ServerUrl"]
            );
        }
    }
}
```

## Environment Variables

Store your API key in environment variables (see framework examples above for usage):

```bash
# Vite (React, Vue) - .env
VITE_BUGPIN_API_KEY=your-api-key
VITE_BUGPIN_SERVER_URL=https://bugpin.example.com

# Next.js - .env.local
NEXT_PUBLIC_BUGPIN_API_KEY=your-api-key
NEXT_PUBLIC_BUGPIN_SERVER_URL=https://bugpin.example.com

# .NET (appsettings.json)
{
  "BugPin": {
    "ApiKey": "your-project-api-key",
    "ServerUrl": "https://bugpin.example.com"
  }
}
```

## Getting Your API Key

You need an API key from your BugPin server to initialize the widget.

1. Deploy BugPin server on your infrastructure (e.g. using [Docker](https://docs.bugpin.io/installation/docker))
2. Log in to the BugPin Admin Console
3. Open **Projects**, create a new project or select an existing one
4. Copy the API key (shown in the project card or in **Project Settings**)

## Documentation

For complete documentation, visit: [BugPin Documentation](https://docs.bugpin.io)

## License

MIT

## Support

- [Documentation](https://docs.bugpin.io)
- [Report Issues](https://github.com/bugpin/bugpin/issues)
- [Discussions](https://github.com/bugpin/bugpin/discussions)
