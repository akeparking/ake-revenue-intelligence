# Demo video narrative

Target: 2–3 minutes, 1920×1080, actual browser footage with concise English captions. No fabricated clicks, fabricated model results, customer data or advertising success claims.

| Beat | Approximate duration | Screen action / point |
|---|---:|---|
| Business problem | 12 s | Public project page: scattered inquiries lose context between sales and marketing |
| Website inquiry | 22 s | Submit a fictional GCC project through the real website chat |
| AI and source evidence | 28 s | Open the received conversation in the workspace, show verified AI mode and exact evidence |
| Human review | 22 s | Keep unknowns blank, confirm fields to Lead, create an opportunity |
| Sales progression | 18 s | Move the opportunity from Discovery to Solution |
| Qualification | 20 s | Explicitly confirm buyer fit, reachable contact, need and next action |
| Feedback | 18 s | Expand the stable event and Mock receipt; distinguish it from live ad attribution |
| Three scenarios and boundaries | 15 s | Compare high / medium / non-target fixtures and actual integration states |

The recording uses the deployed application. Model waiting time is shortened, with a caption explaining that waiting time was omitted. Captions describe observed behavior only. Final duration, file properties and playback checks are recorded in the acceptance record.

`scripts/record-demo.py` records actual Chromium interaction using Playwright. It requires `WORKFLOW_URL`, `DEMO_SITE_URL`, `WORKSPACE_PASSWORD` and `VIDEO_OUTPUT_DIR`; `BROWSER_EXECUTABLE` and `BROWSER_PROXY` are optional. Supply the operator password through your private environment, never in a committed script. It writes an edit list and the original browser recording outside the repository.

`python scripts/render-demo.py "$VIDEO_OUTPUT_DIR"` uses FFmpeg to apply that edit list, preserve the browser aspect ratio and add timed captions on a dedicated bottom strip. It outputs H.264 MP4, SRT, VTT, ASS and a media verification record. There is no narration or music. The public video has burned-in English captions; a separate optional caption track is available for accessibility.
