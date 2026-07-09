#!/usr/bin/env python3
# 우아한 라운지 피아노 BGM (저작권 free, numpy 작곡) — 먼데이투선데이 무드필름용
import numpy as np, wave, struct
SR=44100
rng=np.random.default_rng(7)

def midi(m): return 440.0*2**((m-69)/12.0)

def lp_ma(x, cutoff):
    w=max(1,int(SR/cutoff))
    k=np.hanning(w*2+1); k/=k.sum()
    return np.convolve(x,k,mode='same')

def piano(freq, dur, amp=1.0):
    tail=1.6; n=int((dur+tail)*SR); t=np.arange(n)/SR
    atk=np.clip(t/0.006,0,1)
    env=np.exp(-t/1.7)*atk
    env=np.where(t>dur, env*np.clip(1-(t-dur)/0.28,0,1), env)
    hamp=[1,0.55,0.36,0.24,0.15,0.10,0.06,0.04]
    B=0.0007; sig=np.zeros(n)
    for k,a in enumerate(hamp,1):
        fk=freq*k*np.sqrt(1+B*k*k)
        sig+=a*np.sin(2*np.pi*fk*t)
    return sig*env*amp

def pad(freq, dur, amp=1.0):
    tail=0.7; n=int((dur+tail)*SR); t=np.arange(n)/SR
    atk=np.clip(t/0.55,0,1)
    env=atk*np.where(t>dur, np.clip(1-(t-dur)/0.7,0,1),1.0)
    vib=1+0.004*np.sin(2*np.pi*5.0*t)
    sig=np.zeros(n)
    for k in range(1,11): sig+=(1.0/k)*np.sin(2*np.pi*freq*k*t*vib)
    return lp_ma(sig,2100)*env*amp

def bass(freq, dur, amp=1.0):
    tail=0.9; n=int((dur+tail)*SR); t=np.arange(n)/SR
    env=np.exp(-t/0.8)*np.clip(t/0.01,0,1)
    sig=(np.sin(2*np.pi*freq*t)+0.22*np.sin(2*np.pi*2*freq*t))*env
    return sig*amp

TOTAL=25.0
N=int(TOTAL*SR)
buf=np.zeros(N+SR*2)
def add(sig, at):
    i=int(at*SR); j=min(len(buf), i+len(sig))
    buf[i:j]+=sig[:j-i]

# I-vi-ii-V (Cmaj9 - Am11 - Dm9 - G13), 재즈 9th 보이싱
chords=[
 (48,[64,67,71,74]),   # Cmaj9
 (45,[64,67,72,74]),   # Am11
 (50,[65,69,72,76]),   # Dm9
 (43,[65,71,74,76]),   # G13
]
bar=3.05
for b in range(8):
    t0=b*bar
    root,uppers=chords[b%4]
    # 롤링 피아노 코드
    for i,mn in enumerate(uppers):
        add(piano(midi(mn), bar, amp=0.42*(0.9 if i%2 else 1.0)), t0+i*0.06)
    # 중간박 가벼운 상성 재발음(움직임)
    add(piano(midi(uppers[-1]+0), bar*0.5, amp=0.22), t0+1.55)
    add(piano(midi(uppers[-2]), bar*0.5, amp=0.18), t0+1.62)
    # 스트링 패드
    for mn in uppers:
        add(pad(midi(mn), bar, amp=0.10), t0)
    add(pad(midi(root+12), bar, amp=0.07), t0)
    # 베이스
    add(bass(midi(root), bar, amp=0.34), t0)
    add(bass(midi(root+7), bar*0.5, amp=0.18), t0+1.55)  # 5도

dry=buf[:N]

# --- FFT 컨볼루션 리버브 (스테레오 디코릴레이션) ---
def make_ir(dur=1.4, tau=0.38, seed=0):
    r=np.random.default_rng(seed)
    n=int(dur*SR); t=np.arange(n)/SR
    ir=r.standard_normal(n)*np.exp(-t/tau)
    ir=lp_ma(ir,4200)
    ir[0]+=0.0
    ir/=np.abs(ir).sum()/50.0
    return ir
def fftconv(x, ir):
    L=len(x)+len(ir)-1; nfft=1<<(L-1).bit_length()
    y=np.fft.irfft(np.fft.rfft(x,nfft)*np.fft.rfft(ir,nfft),nfft)[:len(x)]
    return y
irL=make_ir(seed=1); irR=make_ir(seed=2)
wetL=fftconv(dry,irL); wetR=fftconv(dry,irR)

wet=0.30
L=dry*0.82+wetL*wet
R=dry*0.82+wetR*wet
# 살짝 Haas 폭 (R 8ms 지연 소량)
d=int(0.008*SR); R=R+0.12*np.concatenate([np.zeros(d),dry])[:len(R)]

st=np.stack([L,R],axis=1)
# 워엄 하이컷
st=np.stack([lp_ma(st[:,0],9000),lp_ma(st[:,1],9000)],axis=1)
# 페이드
t=np.arange(N)/SR
fin=np.clip(t/1.4,0,1); fout=np.clip((TOTAL-t)/2.6,0,1)
env=(fin*fout)[:,None]; st=st*env
# 소프트 리미터 + 노멀
st=np.tanh(st*1.1)
st/=np.abs(st).max()+1e-9; st*=0.89

# WAV 16-bit
pcm=(st*32767).astype('<i2')
with wave.open('/tmp/mts_bgm.wav','wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote /tmp/mts_bgm.wav", round(TOTAL,1),"s  peak",round(float(np.abs(st).max()),3))
