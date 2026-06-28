/**
 * 사이트 정적 콘텐츠 설정.
 * 딜러의 실제 정보·차종·이미지 경로를 여기서 교체하면 전체 사이트에 반영된다.
 * (SNS 피드는 feed.json 으로 빌드 시 자동 주입)
 */

export interface CarModel {
  name: string;
  tagline: string;
  /** 차급/세그먼트 라벨 */
  segment: string;
  /** hyundai.com 상세 페이지 링크 */
  href: string;
  /** 카드 배경 이미지(선택). 없으면 그라디언트 비주얼로 폴백 */
  image?: string;
}

export interface PortfolioItem {
  title: string;
  /** 출고 차종/고객 한줄 설명 */
  caption: string;
  /** 이미지 경로(선택). 없으면 그라디언트 비주얼 폴백 */
  image?: string;
  /** 영상 링크(선택, 유튜브/드라이브 등) */
  videoUrl?: string;
}

export interface SiteConfig {
  brand: {
    name: string;
    /** 헤더 로고 텍스트(이미지 로고가 없을 때) */
    logoText: string;
    /** 짧은 슬로건 */
    slogan: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    subtitle: string;
    /** 배경 이미지(선택). 없으면 프리미엄 다크 그라디언트 비주얼 */
    backgroundImage?: string;
  };
  about: {
    title: string;
    body: string;
    stats: { value: string; label: string }[];
  };
  models: {
    title: string;
    description: string;
    items: CarModel[];
  };
  portfolio: {
    title: string;
    description: string;
    items: PortfolioItem[];
  };
  youtube: {
    title: string;
    description: string;
    channelUrl: string;
  };
  instagram: {
    title: string;
    description: string;
    profileUrl: string;
  };
  contact: {
    title: string;
    description: string;
    phone: string;
    /** 카카오톡 채널/오픈채팅 링크 */
    kakaoUrl: string;
    hours: string;
    location: string;
  };
}

export const site: SiteConfig = {
  brand: {
    name: '무무 현대자동차',
    logoText: 'MOOMOO',
    slogan: '신뢰로 만나는 현대자동차',
  },
  hero: {
    eyebrow: 'HYUNDAI DEALER',
    title: '당신의 드라이브,\n여기서 시작됩니다',
    subtitle:
      '상담부터 출고까지, 현대자동차 전문 딜러가 처음부터 끝까지 함께합니다.\n진심을 담은 한 대를 약속드립니다.',
    backgroundImage: undefined,
  },
  about: {
    title: '한 대의 차가 아닌,\n오래갈 신뢰를 팝니다',
    body: '수많은 고객의 첫 차와 인생 차를 함께해 왔습니다. 무리한 권유 대신 가장 잘 맞는 선택을, 계약 이후에도 변함없는 케어를 약속합니다.',
    stats: [
      { value: '10년+', label: '현대차 판매 경력' },
      { value: '1,200대+', label: '누적 출고' },
      { value: '4.9★', label: '고객 상담 만족도' },
    ],
  },
  models: {
    title: '주력 차종',
    description: '대표 라인업을 빠르게 만나보세요. 자세한 제원은 현대자동차 공식 페이지에서 확인할 수 있습니다.',
    items: [
      {
        name: '디 올 뉴 그랜저',
        tagline: '플래그십 세단의 품격',
        segment: 'SEDAN',
        href: 'https://www.hyundai.com/kr/ko/e',
      },
      {
        name: '싼타페',
        tagline: '가족을 위한 정공법 SUV',
        segment: 'SUV',
        href: 'https://www.hyundai.com/kr/ko/e',
      },
      {
        name: '아반떼',
        tagline: '첫 차로 완벽한 밸런스',
        segment: 'SEDAN',
        href: 'https://www.hyundai.com/kr/ko/e',
      },
      {
        name: '아이오닉 5',
        tagline: '전동화의 새로운 기준',
        segment: 'EV',
        href: 'https://www.hyundai.com/kr/ko/e',
      },
      {
        name: '팰리세이드',
        tagline: '대형 SUV의 완성',
        segment: 'SUV',
        href: 'https://www.hyundai.com/kr/ko/e',
      },
      {
        name: '쏘나타',
        tagline: '시대를 잇는 베스트셀러',
        segment: 'SEDAN',
        href: 'https://www.hyundai.com/kr/ko/e',
      },
    ],
  },
  portfolio: {
    title: '고객 출고 스토리',
    description: '새로운 차와 함께한 고객들의 순간. 다음 주인공은 당신입니다.',
    items: [
      { title: '그랜저 캘리그래피 출고', caption: '20년 무사고 베테랑 고객님' },
      { title: '아이오닉 5 인도', caption: '첫 전기차에 도전한 신혼부부' },
      { title: '싼타페 패밀리카', caption: '네 식구의 새 출발' },
      { title: '아반떼 N라인', caption: '사회초년생의 첫 차' },
      { title: '팰리세이드 출고', caption: '캠핑을 사랑하는 가족' },
      { title: '쏘나타 디 엣지', caption: '오래 기다린 인생 첫 세단' },
    ],
  },
  youtube: {
    title: '유튜브',
    description: '리뷰·출고·꿀팁까지. 채널의 최신 영상을 만나보세요.',
    channelUrl: 'https://www.youtube.com/@hyundai_moomoo',
  },
  instagram: {
    title: '인스타그램',
    description: '일상 속 생생한 출고 현장과 차량 이야기.',
    profileUrl: 'https://www.instagram.com/',
  },
  contact: {
    title: '지금 상담하세요',
    description: '궁금한 차종, 견적, 프로모션 무엇이든 편하게 문의주세요. 가장 빠르게 답해드립니다.',
    phone: '010-0000-0000',
    kakaoUrl: 'https://pf.kakao.com/',
    hours: '평일 09:00 – 19:00 · 주말·공휴일 예약 상담',
    location: '현대자동차 ○○대리점 · 서울 ○○구 ○○로 00',
  },
};
