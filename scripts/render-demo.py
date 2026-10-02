"""Render the recorded, source-backed walkthrough to MP4 and timed captions."""
import json, subprocess, sys
from pathlib import Path

root = Path(sys.argv[1]).resolve()
manifest = json.loads((root / 'recording.json').read_text())
segments = manifest['segments']
# Preserve any offset established by reviewing the recording's real scene transitions.
video_offset = manifest.get('video_offset_seconds', 0)
clips = root / 'clips'
clips.mkdir(exist_ok=True)
offset = 0
captions = []
def clock(seconds, separator='.'):
    ms = round(seconds * 1000)
    return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02}{separator}{ms%1000:03}'
for index, segment in enumerate(segments):
    duration = segment['end'] - segment['start']
    path = clips / f'{index:02}.mp4'
    subprocess.run(['ffmpeg','-v','error','-y','-ss',str(segment['start']+video_offset),'-i',manifest['source'],'-t',str(duration),'-an','-vf','scale=1920:1008:force_original_aspect_ratio=decrease:flags=lanczos,pad=1920:1080:(ow-iw)/2:0:color=0x0d1110,fps=30','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p',str(path)],check=True)
    actual = float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(path)],text=True))
    # Split long captions into two readable thoughts on the same beat.
    words = segment['caption'].split()
    midpoint = len(words)//2
    chunks = [' '.join(words[:midpoint]), ' '.join(words[midpoint:])] if len(words)>20 else [segment['caption']]
    for part, text in enumerate(chunks):
        captions.append({'start': offset+actual*part/len(chunks), 'end': offset+actual*(part+1)/len(chunks), 'text': text})
    offset += actual
    print(json.dumps({'clip':index+1,'duration':actual}),flush=True)
(root/'concat.txt').write_text('\n'.join("file '"+str(clips/f'{index:02}.mp4')+"'" for index in range(len(segments)))+'\n')
(root/'demo.vtt').write_text('WEBVTT\n\n'+'\n\n'.join(clock(item['start'])+' --> '+clock(item['end'])+'\n'+item['text'] for item in captions)+'\n')
(root/'demo.srt').write_text('\n\n'.join(str(index+1)+'\n'+clock(item['start'],',')+' --> '+clock(item['end'],',')+'\n'+item['text'] for index,item in enumerate(captions))+'\n')
subprocess.run(['ffmpeg','-v','error','-y','-f','concat','-safe','0','-i',str(root/'concat.txt'),'-c','copy',str(root/'clean.mp4')],check=True)
# Explicit script resolution keeps the 28px captions inside the 72px strip.
ass_header='''[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,28,&H00F0F3EF,&H00F0F3EF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,70,70,20,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
def ass_clock(seconds):
    cs=round(seconds*100)
    return f'{cs//360000:01}:{cs//6000%60:02}:{cs//100%60:02}.{cs%100:02}'
(root/'demo.ass').write_text(ass_header+'\n'.join('Dialogue: 0,'+ass_clock(item['start'])+','+ass_clock(item['end'])+',Default,,0,0,0,,'+item['text'] for item in captions)+'\n')
filter_value="ass='"+str(root/'demo.ass')+"'"
subprocess.run(['ffmpeg','-v','error','-y','-i',str(root/'clean.mp4'),'-vf',filter_value,'-an','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',str(root/'demo.mp4')],check=True)
info=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration,size:stream=codec_name,width,height,r_frame_rate','-of','json',str(root/'demo.mp4')],text=True))
assert 120 <= float(info['format']['duration']) <= 180
info['source_backed']=True
info['audio']='No narration; burned-in English captions and a VTT track are provided.'
(root/'video-verification.json').write_text(json.dumps(info,indent=2)+'\n')
print(json.dumps(info),flush=True)
