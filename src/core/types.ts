/**
 * pslab-sns 핵심 타입 정의
 *
 * 모든 SNS 플랫폼 플러그인은 여기 정의된 공통 타입을 사용해
 * 콘텐츠를 표현하고, 발행 결과와 분석 데이터를 주고받는다.
 */

/** 지원하는 SNS 플랫폼 식별자 */
export type PlatformId =
  | 'youtube'
  | 'naver-blog'
  | 'blogger'
  | 'instagram'
  | 'threads'
  | 'linkedin';

/** 첨부 미디어 종류 */
export type MediaKind = 'image' | 'video' | 'thumbnail';

/** 발행에 첨부되는 미디어 자원 */
export interface MediaAsset {
  kind: MediaKind;
  /** 로컬 경로 또는 URL */
  source: string;
  /** 대체 텍스트 / 접근성 설명 */
  alt?: string;
  mimeType?: string;
}

/**
 * 플랫폼 독립적인 게시물 표현.
 * 각 플러그인이 자기 플랫폼 형식으로 변환(adapt)한다.
 */
export interface PostContent {
  /** 추적용 고유 ID (없으면 발행 시 자동 생성) */
  id?: string;
  /** 제목 — 블로그/유튜브에서 주로 사용 */
  title?: string;
  /** 본문 텍스트 */
  body: string;
  /** 해시태그 (앞의 # 없이 단어만) */
  tags?: string[];
  /** 첨부 미디어 */
  media?: MediaAsset[];
  /** 외부 링크 */
  link?: string;
  /** 플랫폼별 추가 옵션 (예: youtube.categoryId) */
  platformOptions?: Partial<Record<PlatformId, Record<string, unknown>>>;
}

/** 단일 플랫폼 발행 결과 */
export interface PublishResult {
  platform: PlatformId;
  ok: boolean;
  /** 발행 성공 시 플랫폼이 부여한 게시물 ID */
  remoteId?: string;
  /** 게시물 공개 URL */
  url?: string;
  /** 실패 시 에러 메시지 */
  error?: string;
  /** 발행 시각 (ISO 8601) */
  publishedAt: string;
}

/** 게시물 성과 지표 */
export interface AnalyticsMetrics {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  /** 0~1 사이 참여율 */
  engagementRate?: number;
}

/** 플랫폼별 분석 리포트 한 건 */
export interface AnalyticsReport {
  platform: PlatformId;
  remoteId: string;
  url?: string;
  metrics: AnalyticsMetrics;
  collectedAt: string;
}

/** 플러그인 인증/연결에 필요한 자격 증명 */
export interface PluginCredentials {
  [key: string]: string | undefined;
}

/** 플러그인 연결 결과 */
export interface ConnectionStatus {
  platform: PlatformId;
  connected: boolean;
  /** 연결된 계정/채널 표시 이름 */
  account?: string;
  detail?: string;
}
