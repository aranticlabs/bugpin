# Video remux fixtures

These recordings were generated with the browser `MediaRecorder` API from a
320 x 180 animated canvas and, where named, a 440 Hz Web Audio track. They contain
no third-party media.

Browser versions:

- Chrome for Testing 151.0.7922.34
- Firefox 153.0
- Playwright WebKit 26.5

All recordings used a 200 ms timeslice. The requested types and measured lengths are:

| File                       | Requested MIME type                      |  Length |
| -------------------------- | ---------------------------------------- | ------: |
| `chrome-with-audio.mp4`    | `video/mp4;codecs=avc1.42E01E,mp4a.40.2` | 0.892 s |
| `chrome-without-audio.mp4` | `video/mp4;codecs=avc1.42E01E`           | 0.916 s |
| `chrome-cut-off.mp4`       | `video/mp4;codecs=avc1.42E01E,mp4a.40.2` | 0.664 s |
| `firefox-with-audio.webm`  | `video/webm;codecs=vp8,opus`             | 0.899 s |
| `webkit-with-audio.mp4`    | `video/mp4;codecs=avc1.42E01E,mp4a.40.2` | 2.048 s |

`chrome-cut-off.mp4` omits the chunk emitted by `stop()`, matching a recording
recovered before the recorder wrote its final metadata.

SHA-256:

- `chrome-with-audio.mp4`: `b5a28841e08fdfd644c863f12dc8b04f2c7a49b93d85707b142f84f86f2ec0cd`
- `chrome-without-audio.mp4`: `7c0f017f7cefa25099be0999e6216f00e964a43aa042def0a857c2ad0113a509`
- `chrome-cut-off.mp4`: `b0b9b63649336fd65393777eed392bbe9e4eef22845d592f97ac3a984e6b8ad3`
- `firefox-with-audio.webm`: `c3fc1e729d05d3273de53428ffa43e8d5cf185570f26ea32820fb99ccf35596e`
- `webkit-with-audio.mp4`: `b4e58c75599b571e7cc6d09230aa38944ea2113591fec55abb9bf535124f46a8`
