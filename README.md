# HepTimer.

개인용 고기능성 집중 타이머(Focus Timer) 웹서비스입니다. Hepta 디자인 시스템 가이드라인을 준수하며 Next.js App Router, TypeScript, Tailwind CSS, Supabase, Vercel 배포를 기반으로 구축되었습니다.

## 주요 기능 (Features)

- ⏱️ **정밀 타이머 제어**: `Start` / `Pause` / `Resume` / `Complete` / `Cancel` 흐름 세분화 지원
- 🏃 **3단계 다이내믹 캐릭터 애니메이션**: 
  - 세션 진행률에 따라 캐릭터 모션 자동 전환: **기어가기 (0%~33%) ➔ 걷기 (33%~66%) ➔ 뛰기 (66%~100%)**
  - 타이머 일시정지(`Pause`) 시 애니메이션도 그 자리에서 멈추며, 숫자가 흔들리지 않도록 정밀한 레이아웃 고정 설계 적용
- ⚙️ **알림 제어 설정 모달**:
  - Web Audio API 기반의 세션 완료 차임벨 알림음 온/오프 토글
  - 브라우저 및 OS 시스템 푸시 알림 온/오프 토글
  - `localStorage`를 활용해 브라우저를 닫아도 설정 유지
- 📊 **인터랙티브 대시보드 & 통계**:
  - 일간 / 주간 / 월간 단위의 Focus Heatmap 및 막대 차트(Bar Chart)
  - 하단의 막대 그래프 클릭 시, 해당 날짜/주간/월간으로 집중 기록 테이블(Focus History)이 즉시 필터링되는 인터랙티브 연동
  - 카테고리 필터 선택 시 히트맵, 막대 차트, 목록이 유기적으로 동시 동기화
- 📁 **카테고리 관리 고도화**:
  - 카테고리 생성 시 기본 컬러 외에 5가지의 커스텀 브랜드 컬러 지정 기능
  - 편집 모드를 통해 카테고리 이름 실시간 수정 및 삭제 (관련 세션은 일괄 미지정 처리)
- ☁️ **Supabase 클라우드 동기화**:
  - 이메일/패스워드 인증 및 회원가입
  - 로그인 시 개인별 카테고리 설정 및 집중 데이터가 Supabase DB에 실시간 안전 동기화

## 시작하기 (Getting Started)

### 1. 패키지 설치 및 로컬 서버 실행

```bash
# 의존성 패키지 설치 (pnpm 권장)
pnpm install

# 개발 서버 실행
pnpm dev
```

브라우저에서 `http://localhost:3000` 주소로 접속합니다.

### 2. Supabase 데이터베이스 설정

1. [Supabase](https://supabase.com) 프로젝트를 생성합니다.
2. `supabase/schema.sql` 스크립트를 Supabase Dashboard > SQL Editor에 붙여넣고 실행합니다.
3. `Authentication > Providers`에서 **Email provider**를 활성화합니다.
4. (선택) 이메일 인증 절차 없이 바로 테스트하고 싶다면, `Authentication > Providers > Email` 설정 내 **Confirm email** 옵션을 비활성화합니다.
5. `Authentication > Redirect URLs`에 로컬 개발 주소(`http://localhost:3000`)를 리다이렉트 URL로 추가합니다.

### 3. 환경 변수 구성

프로젝트 루트 폴더에 `.env.local` 파일을 생성하고 Supabase API 키를 입력합니다.

```env
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

## Vercel 배포 방법 (Deployment)

1. 이 프로젝트를 본인의 GitHub 공개/비공개 저장소에 Push합니다.
2. [Vercel](https://vercel.com) 대시보드로 이동해 **Add New > Project**를 누릅니다.
3. 대상 GitHub 저장소를 가져옵니다 (Import).
4. **Environment Variables** 항목을 열고 아래 2개 환경 변수를 등록합니다:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. **Deploy** 버튼을 누르면 배포가 완료됩니다!
