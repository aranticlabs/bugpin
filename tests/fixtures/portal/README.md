# Portal playback fixture

`seekable.webm` is a finalized VP8/Opus recording generated from
`../video-remux/firefox-with-audio.webm` with the existing `remuxRecording` utility.
It contains the same animated canvas and synthetic audio, without transcoding or
third-party content. The original recording has no finite container duration;
this finalized clip tests authorized browser playback and seeking independently
of recording finalization, which has its own service tests.

SHA-256: `c5cb0df7fb13d721e2297f4abb31bea068a1df3219c02932f96bb0f5e39de837`.
