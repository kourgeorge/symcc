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
