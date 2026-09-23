# HANA 현장조사 보관함

일정표 인식, 현장 사진 촬영·업로드, 조사 기록, 일일보고, 주소별 폴더, 도면 편집과 Visio 내보내기를 제공하는 팀용 웹앱입니다.

## 구성

- React / TypeScript / Vinext → Cloudflare Workers
- D1: 계정·세션, 일정·조사 기록, 사진 메타데이터, 도면, 사용량
- 비공개 R2: 업로드한 원본 이미지
- 일정 OCR: 브라우저 Tesseract 한국어·영어, 도면 글자: Cloudflare Workers AI + 로컬 선 검출
- Supabase와 JWT는 사용하지 않습니다. 임의 세션 토큰의 SHA-256 해시를 D1에 저장하고 HttpOnly 쿠키로 인증합니다.

## 로컬 실행과 검증

Node.js 22.13 이상(현재 검증: 24), Python 3, Git이 필요합니다. 의존성은 잠금 파일을 유지해 설치합니다.

```sh
pnpm install --frozen-lockfile
npm run verify
npm start -- --port 4175
```

처음 실행하는 로컬 D1에는 `drizzle/` 마이그레이션을 적용해야 합니다. `dist/server/wrangler.json`의 D1 `migrations_dir`을 `../../drizzle`로 설정한 뒤 다음 명령을 사용합니다.

```sh
node node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --local --config dist/server/wrangler.json --persist-to .wrangler/state
```

로컬 전용 관리 키는 무시되는 `.dev.vars`에 `ADMIN_SETUP_KEY`로 설정하고 `/account/setup`에서 테스트 공용 계정을 만듭니다. 기본 아이디·비밀번호는 없습니다. 기존 DB의 `SITE_DATA_OWNER`는 데이터 연결에 사용되므로 임의로 바꾸지 않습니다.

`npm run verify`는 타입 검사 → 앱 린트 → 모든 `*.test.mjs` → 빌드 → 모든 `*.integration.mjs`를 실행합니다. 테스트는 합성 자료와 임시 Miniflare 저장소를 사용합니다. Python 자동 탐색에 실패하면 `HANA_PYTHON`을 실행 파일 경로로 지정합니다. UTF-8 설정은 검증 스크립트가 처리합니다.

## 원본 보관과 복원

- 일반 사진 ZIP: 현장 사진만 포함합니다. 도면·Visio·일정표 원본은 제외합니다. 폴더 구조는 선택 위치부터 시작합니다. 큰 자료는 200MB 단위로 나눠 받을 수 있습니다.
- **전체 백업·복원**: 데스크톱 Chrome/Edge의 폴더 선택 기능으로 원본과 전체 기록을 함께 저장합니다. 파일별 SHA-256과 저장된 바이트를 확인한 뒤에만 `manifest.json`을 만듭니다.
- 중단된 백업은 만들어진 `HANA-…` 폴더를 골라 이어서 진행합니다. 작업 중 변경·삭제된 원본은 오류로 알리므로 정리 작업 전에 백업 완료를 확인하세요.
- 복원은 먼저 모든 파일을 검증하고 별도 `복원 …` 구역에 추가합니다. 기존 일정은 덮어쓰지 않습니다. 미완료 복원은 숨겨져 있고 같은 백업으로 재시도할 수 있으며 임시 자료 정리도 가능합니다.
- 미전송 사진은 해당 기기 IndexedDB에 원본과 업로드 작업 번호로 임시 보관합니다(최대 200장 / 512MiB). 서버 확인 후 제거합니다. 브라우저 저장소 삭제·기기 분실까지 보호하는 백업은 아닙니다. 임시 보관에 실패하면 경고 후 직접 업로드하며 촬영 원본을 별도로 내려받을 수 있습니다.

## 비용 제한과 운영

기본 저장 제한은 **8GB**이며 최근 32일 R2 읽기 50만/쓰기 5만 회를 앱에서 제한합니다. 이는 Cloudflare 계정 전체의 과금 차단 설정이 아닙니다. 저장 한도 증가는 관리 키와 비용 확인을 요구하며 Cloudflare 요금제를 자동 변경하지 않습니다. 사용량 80%부터 경고하고 최근 7일 업로드량 기준의 예상 잔여 일수를 보여줍니다.

실제 연락처를 소스에서 기본 일정으로 생성하지 않습니다. 기존 D1 자료는 유지됩니다. 저장소 과거 이력의 연락처 제거는 별도의 이력 정리 작업이 필요합니다.

## 배포

사용자가 배포를 승인한 경우에만 `npm run deploy:production`을 실행합니다. 이 명령도 동일한 `verify`를 통과해야 원격 마이그레이션·배포를 시작합니다. `npm run deploy:production -- --check`는 검증과 dry run까지만 수행합니다.

- 대상: 무시되는 `cloudflare/deployment.json`
- 관리 키: 무시되는 `.deploy-secrets/production.json`
- 검증 기록: `dist/build-provenance.json` (Git revision, 소스 SHA-256, 검증 시각)
- 배포 기록: `.sites-runtime/deployments.jsonl` (위 정보와 Worker version ID)

롤백 전 전체 백업과 D1 복구 지점을 확인하고, 기록한 이전 Worker version ID를 Cloudflare의 롤백 기능으로 선택합니다. Worker 롤백은 D1 스키마나 자료를 되돌리지 않습니다. 현재 추가 마이그레이션은 기존 열을 삭제하지 않지만 이전 Worker는 신규 검증을 우회할 수 있으므로 되돌린 뒤 업로드·수정·다운로드를 재확인해야 합니다.
