# symcc video

`symcc.mp4` (the full video, 78 seconds, 1280x720, no sound) and `symcc.gif` (a 20-second
preview shown at the top of the main README) are made by `make_video.py`. To rebuild them,
run `python3 docs/video/make_video.py` from the project folder. It needs Python 3 with
Pillow (`pip install Pillow`), ffmpeg (on your PATH, or set `FFMPEG=/path/to/ffmpeg`) and
the macOS fonts Helvetica Neue and Menlo (on other systems, point `FONT_SANS` and
`FONT_MONO` at a sans-serif and a monospace `.ttf`). The script draws every frame itself
in the colors of `docs/logo.svg`, `docs/demo.svg` and `docs/architecture.svg`; to change
the story, edit the scene functions and the `SCENES` list. Use
`python3 docs/video/make_video.py --frame 40` to save just the frame at 40 seconds to
`/tmp` and check it before building the whole video.

## YouTube video with a voice

`make_youtube_video.py` builds the narrated explainer for YouTube (about 1 minute 50
seconds, 1920x1080, 30 fps, H.264 video with AAC sound). It reads the words from
`narration.md`, so change the story there. Each scene lasts as long as its spoken words,
plus a short pause. The sound is turned up to about -14 LUFS (as loud as most YouTube videos, peaks under -1 dBTP).

What you need, once:

    python3 -m venv ~/.cache/symcc-video/venv
    ~/.cache/symcc-video/venv/bin/pip install kokoro-onnx Pillow

plus ffmpeg and the fonts listed above. The voice is [Kokoro](https://github.com/thewh1teagle/kokoro-onnx):
free, open source, and it runs on your own computer. The first run downloads its model
files (about 350 MB) to `~/.cache/symcc-video`, outside the project, so they are never
committed. Spoken clips are kept there too, so later runs are quick.

Run it from the project folder:

    ~/.cache/symcc-video/venv/bin/python docs/video/make_youtube_video.py

It writes `docs/video/out/symcc_youtube.mp4` (not committed: `out/` is in `.gitignore`),
`docs/video/symcc_youtube.srt` (subtitles to upload with the video) and
`docs/video/symcc_youtube_thumbnail.png` (1280x720). Useful checks before a full build:
`--frame 40` saves the frame at 40 seconds to `/tmp`, `--clip 2` saves scene 2's sound to
`/tmp` so you can listen to it, `--times` prints when each scene starts, and
`--thumbnail` makes only the thumbnail.

To change the voice, set `VOICE`, for example
`VOICE=am_michael ~/.cache/symcc-video/venv/bin/python docs/video/make_youtube_video.py`
(the default is `af_heart`; others include `am_michael`, `af_bella`, `bf_emma` and
`bm_george`). `SPEED` changes how fast it speaks (default `0.9`). The voice says the
name "symcc" the way `SPOKEN_NAME` spells it (default `"sim see see"`); the screen and the
subtitles still show "symcc".

## Short video: scouts, the owner and the pipeline

`make_scouts_video.py` builds a vertical short (about 73 seconds, 1080x1920, 30 fps,
H.264 with AAC sound) drawn like an illuminated manuscript: parchment, painted vine
borders, blackletter headings, pinned notes with red ink stamps and threads, and a small
brass robot. It shows how scouts and the owner turn problems into tasks, how a task goes
through the pipeline, what a task holds, how the lead orders tasks and keeps each change
traceable, and the holes that closed, with real tasks and numbers from this project's
board. The words are in `scouts_narration.md` (each scene has Narration, On screen and
Caption; the Caption line names the word shown in red). It shares the voice, timing,
loudness, subtitles and encoding with `make_youtube_video.py`, so it needs the same setup
as above, plus the macOS fonts Hoefler Text and Menlo. The blackletter font
(UnifrakturMaguntia, SIL Open Font License) is downloaded once to
`~/.cache/symcc-video/fonts`; without it the headings use Hoefler Text.

    ~/.cache/symcc-video/venv/bin/python docs/video/make_scouts_video.py

It writes `docs/video/out/symcc_scouts.mp4` (not committed), `docs/video/symcc_scouts.srt`
and `docs/video/symcc_scouts_thumbnail.png` (1080x1920). The same checks work: `--times`
(also counts the words), `--frame 12`, `--clip 2` and `--thumbnail`. `SPEED` defaults to
`1.0` here.
