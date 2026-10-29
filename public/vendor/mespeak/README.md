# NETRA on-device Kannada speech fallback

Unmodified meSpeak.js 2.0.7 by Norbert Landsteiner / mass:werk, based on
speak.js and eSpeak. Upstream: https://www.masswerk.at/mespeak/
Distribution: https://www.masswerk.at/mespeak/mespeak.zip?v=2.0.7

The original license is in `License.txt`. Original readable JavaScript sources
and configuration are in `src/`. The eSpeak upstream source is available at
https://espeak.sourceforge.net/download.html and speak.js at
https://github.com/kripken/speak.js .

NETRA loads the engine and `voices/kn.json` from its own hosting only when
Catalyst speech is unavailable and no matching browser Kannada voice works.
The engine generates a WAV locally; text is not sent to another cloud service.
This is a basic formant-synthesis fallback, not Catalyst's neural voice, and
will sound more robotic. Mobile devices with working Kannada voices retain
their existing system-voice path. Runtime vendor files are unmodified.
