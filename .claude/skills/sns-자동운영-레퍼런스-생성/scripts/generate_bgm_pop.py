#!/usr/bin/env python3
# 밝고 경쾌한 여름 팝 BGM (저작권 free, numpy) — AWK 주니어 무드필름용
import numpy as np, wave
SR=44100
def midi(m): return 440.0*2**((m-69)/12.0)
def lp_ma(x,cut):
    w=max(1,int(SR/cut)); k=np.hanning(w*2+1); k/=k.sum(); return np.convolve(x,k,'same')

TOTAL=25.0; N=int(TOTAL*SR)
buf=np.zeros(N+SR*2)
def add(sig,at):
    i=int(at*SR); j=min(len(buf),i+len(sig)); buf[i:j]+=sig[:j-i]

def pluck(freq,dur,amp=1.0,bright=1.0):
    tail=0.4; n=int((dur+tail)*SR); t=np.arange(n)/SR
    env=np.exp(-t/ (0.16*bright))*np.clip(t/0.004,0,1)
    # saw-ish (bright)
    sig=np.zeros(n)
    for k,a in zip([1,2,3,4,5,6],[1,.6,.4,.28,.18,.12]):
        sig+=a*np.sin(2*np.pi*freq*k*t)
    return lp_ma(sig,4500)*env*amp

def bass(freq,dur,amp=1.0):
    tail=0.15; n=int((dur+tail)*SR); t=np.arange(n)/SR
    env=np.exp(-t/0.28)*np.clip(t/0.006,0,1)*np.clip(1-(t-dur)/0.08,0,1)
    sig=np.sin(2*np.pi*freq*t)+0.4*np.sin(2*np.pi*2*freq*t)
    # slight saturation for punch
    return np.tanh(sig*1.3)*env*amp

def kick(amp=1.0):
    n=int(0.28*SR); t=np.arange(n)/SR
    f=110*np.exp(-t/0.03)+45  # pitch drop
    sig=np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-t/0.12)
    sig+=np.exp(-t/0.004)*0.6  # click
    return sig*amp

def clap(amp=1.0):
    n=int(0.22*SR); t=np.arange(n)/SR
    rng=np.random.default_rng(3)
    env=np.exp(-t/0.10)
    sig=lp_ma(rng.standard_normal(n),6000)-lp_ma(rng.standard_normal(n),1200)
    return sig*env*amp

def hat(amp=1.0):
    n=int(0.06*SR); t=np.arange(n)/SR
    rng=np.random.default_rng(7)
    sig=rng.standard_normal(n)*np.exp(-t/0.02)
    return (sig-lp_ma(sig,7000))*amp

# 진행: C - G - Am - F (밝은 팝), 상성 보이싱
chords=[
 (48,[60,64,67]),   # C
 (43,[59,62,67]),   # G
 (45,[60,64,69]),   # Am
 (41,[60,65,69]),   # F
]
bar=2.14; beat=bar/4
for b in range(12):
    t0=b*bar
    if t0>=TOTAL: break
    root,notes=chords[b%4]
    # 드럼: 포온플로어 킥 + 2·4 클랩 + 오프비트 햇
    for k in range(4):
        add(kick(0.9), t0+k*beat)
        add(hat(0.10), t0+k*beat+beat*0.5)
    add(clap(0.5), t0+beat); add(clap(0.5), t0+3*beat)
    # 베이스: 8분 바운스 (루트-루트-5도)
    bassline=[root,root,root+7,root, root,root+7,root,root+12]
    for i,mn in enumerate(bassline):
        add(bass(midi(mn),beat*0.5,0.5), t0+i*beat*0.5)
    # 플럭 아르페지오: 상성 코드 8분음, 밝게
    arp=[notes[0],notes[1],notes[2],notes[1]]*2
    for i,mn in enumerate(arp):
        add(pluck(midi(mn+12),beat*0.5,0.16,bright=0.9), t0+i*beat*0.5+0.0)
    # 리드 벨(마디 앞 강조음)
    add(pluck(midi(notes[2]+12),beat,0.13,bright=1.4), t0)

dry=lp_ma(buf[:N], 12000)  # 살짝만 부드럽게(밝기 유지)

# 가벼운 스테레오 리버브
def ir(seed,dur=0.7,tau=0.16):
    r=np.random.default_rng(seed); n=int(dur*SR); t=np.arange(n)/SR
    x=r.standard_normal(n)*np.exp(-t/tau); x=lp_ma(x,5000); return x/np.abs(x).sum()*30
def fftconv(x,k):
    L=len(x)+len(k)-1; nf=1<<(L-1).bit_length()
    return np.fft.irfft(np.fft.rfft(x,nf)*np.fft.rfft(k,nf),nf)[:len(x)]
wet=0.14
L=dry+fftconv(dry,ir(1))*wet
R=dry+fftconv(dry,ir(2))*wet
st=np.stack([L,R],1)
# 페이드
t=np.arange(N)/SR
env=(np.clip(t/0.6,0,1)*np.clip((TOTAL-t)/1.8,0,1))[:,None]
st=st*env
st=np.tanh(st*0.9)
st/=np.abs(st).max()+1e-9; st*=0.92
pcm=(st*32767).astype('<i2')
with wave.open('/tmp/awk_bgm.wav','wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print("wrote /tmp/awk_bgm.wav", round(TOTAL,1),"s peak",round(float(np.abs(st).max()),3),"rms",round(float(np.sqrt((st**2).mean())),3))
