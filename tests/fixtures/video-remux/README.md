# Video remux fixtures

These recordings were generated with the browser `MediaRecorder` API from an
animated canvas and, where named, a 440 Hz Web Audio track. They contain no
third-party media.

Browser versions:

- Chrome for Testing 151.0.7922.34
- Firefox 153.0
- Playwright WebKit 26.5
- Chrome 152.0.7977.167

The Chrome 151, Firefox, and WebKit recordings used a 320 x 180 canvas and a 200 ms
timeslice. The Chrome 152 recordings (`chrome-vp9*.webm`) used an opaque 160 x 90
canvas animated at 15 fps and a 1000 ms timeslice, matching Chrome's default
`video/webm;codecs=vp9` output. Both contain SimpleBlocks only. The requested types
and measured lengths are:

| File                       | Requested MIME type                      |  Length |
| -------------------------- | ---------------------------------------- | ------: |
| `chrome-with-audio.mp4`    | `video/mp4;codecs=avc1.42E01E,mp4a.40.2` | 0.892 s |
| `chrome-without-audio.mp4` | `video/mp4;codecs=avc1.42E01E`           | 0.916 s |
| `chrome-cut-off.mp4`       | `video/mp4;codecs=avc1.42E01E,mp4a.40.2` | 0.664 s |
| `firefox-with-audio.webm`  | `video/webm;codecs=vp8,opus`             | 0.899 s |
| `webkit-with-audio.mp4`    | `video/mp4;codecs=avc1.42E01E,mp4a.40.2` | 2.048 s |
| `chrome-vp9.webm`          | `video/webm;codecs=vp9`                  | 1.189 s |
| `chrome-vp9-opus.webm`     | `video/webm;codecs=vp9,opus`             | 1.187 s |

`chrome-cut-off.mp4` omits the chunk emitted by `stop()`, matching a recording
recovered before the recorder wrote its final metadata.

SHA-256:

- `chrome-with-audio.mp4`: `b5a28841e08fdfd644c863f12dc8b04f2c7a49b93d85707b142f84f86f2ec0cd`
- `chrome-without-audio.mp4`: `7c0f017f7cefa25099be0999e6216f00e964a43aa042def0a857c2ad0113a509`
- `chrome-cut-off.mp4`: `b0b9b63649336fd65393777eed392bbe9e4eef22845d592f97ac3a984e6b8ad3`
- `firefox-with-audio.webm`: `c3fc1e729d05d3273de53428ffa43e8d5cf185570f26ea32820fb99ccf35596e`
- `webkit-with-audio.mp4`: `b4e58c75599b571e7cc6d09230aa38944ea2113591fec55abb9bf535124f46a8`
- `chrome-vp9.webm`: `23d9f7eb910f6abb611ec9bf186583cb20ca800e1fe1e7df59a142191b02e922`
- `chrome-vp9-opus.webm`: `3eb0ab4047b34b23a0bcd9246e414cd42162aede4158407fd55792fb76e46959`
