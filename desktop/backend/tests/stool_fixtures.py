"""Synthetic installed-UI fixtures; ephemeral P12 stays outside diagnostics."""
import argparse
from pathlib import Path
from pypdf import PdfReader

def main():
    p=argparse.ArgumentParser();p.add_argument('mode',choices=['create','pdf','signed','pdfa']);p.add_argument('path');a=p.parse_args();path=Path(a.path)
    if a.mode=='create':
        from sign_runtime_smoke import make_fixtures
        from PIL import Image, ImageDraw, ImageFont
        path.mkdir(parents=True,exist_ok=True)
        pdf,cert=make_fixtures();(path/'source.pdf').write_bytes(pdf);(path/'certificate.p12').write_bytes(cert)
        (path/'source.rtf').write_text(r'{\rtf1\ansi SOLYAN OFFICE TEST 12345}',encoding='ascii')
        image=Image.new('RGB',(1800,300),'white');draw=ImageDraw.Draw(image)
        draw.text((50,80),'SOLYAN OCR TEST 12345',font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',72),fill='black');image.save(path/'source.png')
    else:
        pdf=PdfReader(path);assert len(pdf.pages)==1
        if a.mode=='signed':assert any(f.get('/FT')=='/Sig' and f.get('/V') for f in pdf.get_fields().values())
        if a.mode=='pdfa':assert '/Metadata' in pdf.trailer['/Root'] and '/OutputIntents' in pdf.trailer['/Root']
        print(f'{a.mode} output PASS: {path.name}')
if __name__=='__main__':main()
