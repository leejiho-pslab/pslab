/**
 * 디자인 스튜디오 — 이미지 스타일 관리 + 자가 진화 (설계도 2번 "제작 능력 자가 업그레이드")
 *
 * 클라이언트마다 "현재 디자인 스타일"을 들고 있고, 매 사이클의
 * AI 회의 디자인 피드백 + 반응도(참여율)로 스타일을 스스로 업그레이드한다.
 *  - 참여율이 오르면(또는 첫 사이클) → 현재 스타일 유지·강화
 *  - 참여율이 떨어지면 → 구도/톤을 다음 변형으로 바꿔 탐색(exploration)
 *  - 회의의 designNotes는 누적 메모로 쌓여 프롬프트에 반영
 *
 * 이미지 자체는 GeminiImageProvider(나노바나나)가 buildPrompt 결과로 생성한다.
 */
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { createLogger } from './logger.js';

const log = createLogger('design');

export interface DesignStyle {
  /** 진화 버전 (올라갈수록 학습 누적) */
  version: number;
  /** 색감 */
  palette: string;
  /** 분위기/톤 */
  mood: string;
  /** 구도/레이아웃 */
  composition: string;
  /** 자주 쓰는 시각 요소 */
  motifs: string[];
  /** 지양할 것 */
  avoid: string[];
  /** 누적 학습 메모 (회의 피드백) */
  notes: string[];
  /** 연속 하락 횟수 (탐색 트리거용) */
  declineStreak: number;
  updatedAt: string;
}

/** 구도 탐색용 변형 풀 — 하락 시 순환하며 새 방향을 시도 */
const COMPOSITION_VARIANTS = [
  '중앙 집중형, 핵심 메시지를 크고 굵게',
  '좌측 텍스트 + 우측 여백의 비대칭 구도',
  '상단 헤드라인 + 하단 보조 정보의 2단 구성',
  '풀블리드 배경 위 오버레이 텍스트',
  '그리드/카드형 정렬',
];

export function defaultDesignStyle(): DesignStyle {
  return {
    version: 1,
    palette: '딥네이비 + 화이트 + 포인트 오렌지, 고대비·고급스러운',
    mood: '신뢰감 있고 전문적이며 깔끔한',
    composition: COMPOSITION_VARIANTS[0],
    motifs: ['미니멀 그래프/도형', '여백', '굵은 산세리프 헤드라인'],
    avoid: [
      '사람 얼굴이나 인물 사진(주제와 무관한 모델·인물 금지)',
      '과한 스톡사진 느낌',
      '잡다한 요소',
      '저화질',
      '클립아트',
      '워터마크·로고·깨진 글자',
    ],
    notes: [],
    declineStreak: 0,
    updatedAt: new Date().toISOString(),
  };
}

export interface BuildPromptInput {
  topic: string;
  /** 추천 형식 (예: '짧은 영상', '카드뉴스') — 썸네일 톤 결정에 사용 */
  format: string;
  brandTone: string;
  style: DesignStyle;
}

export class DesignStudio {
  /**
   * Gemini(나노바나나)에 보낼 이미지 생성 프롬프트를 만든다.
   * 현재 스타일 + 주제 + 브랜드 톤을 합쳐 구체적으로 지시한다.
   */
  buildPrompt(input: BuildPromptInput): string {
    const s = input.style;
    const thumbnailHint = input.format.includes('영상')
      ? '영상 썸네일처럼 첫 3초에 시선을 잡는 강한 후킹 비주얼.'
      : '피드에서 멈추게 만드는 한 장의 임팩트 비주얼.';
    return [
      `주제: "${input.topic}" 를 표현한 SNS 인스타그램용 정사각형(1:1) 그래픽.`,
      '형태: 인물 사진이 아니라 텍스트 중심의 에디토리얼/인포그래픽 카드. 추상 도형·아이콘·미니멀 일러스트로 개념을 시각화.',
      `브랜드 톤: ${input.brandTone}.`,
      `스타일: ${s.mood}. 색감: ${s.palette}.`,
      `구도: ${s.composition}.`,
      `요소: ${s.motifs.join(', ')}.`,
      thumbnailHint,
      '텍스트를 넣는다면 한국어로 짧고 크게, 가독성 최우선.',
      `피해야 할 것: ${s.avoid.join(', ')}.`,
      s.notes.length > 0 ? `반영할 학습: ${s.notes.slice(-3).join(' / ')}.` : '',
      '고해상도, 브랜드 그래픽 디자이너 퀄리티의 깔끔한 벡터형 비주얼.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  /**
   * 회의 피드백 + 반응도로 스타일을 진화시킨다.
   * @returns 업그레이드된 새 스타일
   */
  evolve(
    style: DesignStyle,
    signals: {
      designNotes: string[];
      engagement: number;
      prevEngagement?: number;
    },
  ): DesignStyle {
    const next: DesignStyle = {
      ...style,
      motifs: [...style.motifs],
      avoid: [...style.avoid],
      notes: [...style.notes],
    };

    // 회의 디자인 피드백 누적 (중복 제거, 최근 10개 유지)
    for (const note of signals.designNotes) {
      if (note && !next.notes.includes(note)) next.notes.push(note);
    }
    next.notes = next.notes.slice(-10);

    const improved =
      signals.prevEngagement === undefined ||
      signals.engagement >= signals.prevEngagement;

    if (improved) {
      // 잘 먹힘 → 현재 방향 유지·강화
      next.declineStreak = 0;
    } else {
      // 하락 → 누적되면 구도를 다음 변형으로 바꿔 탐색
      next.declineStreak += 1;
      if (next.declineStreak >= 2) {
        const idx = COMPOSITION_VARIANTS.indexOf(next.composition);
        next.composition =
          COMPOSITION_VARIANTS[(idx + 1) % COMPOSITION_VARIANTS.length];
        next.declineStreak = 0;
        log.info(`디자인 탐색: 구도 변경 → "${next.composition}"`);
      }
    }

    next.version += 1;
    next.updatedAt = new Date().toISOString();
    return next;
  }
}

/**
 * 클라이언트별 디자인 스타일 저장소 (격리).
 * data/<clientId>/design.json 에 단일 스타일을 보관한다.
 */
export class DesignStore {
  constructor(private readonly baseDir: string) {}

  private fileFor(clientId: string): string {
    return join(this.baseDir, clientId, 'design.json');
  }

  load(clientId: string): DesignStyle {
    const file = this.fileFor(clientId);
    if (existsSync(file)) {
      try {
        return JSON.parse(readFileSync(file, 'utf8')) as DesignStyle;
      } catch {
        /* fallthrough */
      }
    }
    return defaultDesignStyle();
  }

  save(clientId: string, style: DesignStyle): void {
    const file = this.fileFor(clientId);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(style, null, 2), 'utf8');
  }
}
