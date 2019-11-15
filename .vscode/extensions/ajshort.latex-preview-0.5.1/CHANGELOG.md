# Changelog

## 0.5.1

* Mirror the project structure in the build directory so sub-folder includes work.
* Set OUTPUTDIR env variable to the build dir (thanks @phyrog).

## 0.5.0

* Scale to the widest page.
* Show stderr in the output.
* Config option `latex-preview.filename` to specify the file to preview.

## 0.4.0

* Allow using `latexmk` for generating the preview.
* Re-generate all previews when any latex document is saved by default.

## 0.3.1

* Fix issue when using MikTeX.

## 0.3.0

* Show compile output in a "LaTeX Preview" output channel.
* Show compile output when compile error clicked.

## 0.2.1

* Compile in correct directory so included files can be resolved.

## 0.2.0

* Allow configuring a custom compile command using `latex-preview.command`, e.g. to use XeTeX.
* Widget to zoom in and out on the preview.

## 0.1.0

* Initial release.
