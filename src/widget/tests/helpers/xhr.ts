export interface MockXhrRequest {
  body: Document | XMLHttpRequestBodyInit | null;
  headers: Record<string, string>;
  method: string;
  url: string;
  respond(status: number, body: string): void;
  fail(): void;
  progress(loaded: number, total: number): void;
}

export function installMockXMLHttpRequest(onSend: (request: MockXhrRequest) => void): () => void {
  const original = globalThis.XMLHttpRequest;

  class MockXMLHttpRequest {
    method = '';
    url = '';
    body: Document | XMLHttpRequestBodyInit | null = null;
    headers: Record<string, string> = {};
    status = 0;
    responseText = '';
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    upload = {
      onprogress: null as ((event: ProgressEvent) => void) | null,
    };

    open(method: string, url: string): void {
      this.method = method;
      this.url = url;
    }

    setRequestHeader(name: string, value: string): void {
      this.headers[name] = value;
    }

    send(body: Document | XMLHttpRequestBodyInit | null): void {
      this.body = body;
      onSend(this);
    }

    abort(): void {
      this.onabort?.();
    }

    respond(status: number, body: string): void {
      this.status = status;
      this.responseText = body;
      this.onload?.();
    }

    fail(): void {
      this.onerror?.();
    }

    progress(loaded: number, total: number): void {
      this.upload.onprogress?.({ lengthComputable: true, loaded, total } as ProgressEvent);
    }
  }

  globalThis.XMLHttpRequest = MockXMLHttpRequest as unknown as typeof XMLHttpRequest;
  return () => {
    globalThis.XMLHttpRequest = original;
  };
}
