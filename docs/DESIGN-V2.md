# 교실 화면 개편 · 2026-11-13

## 적용

- 상단바 이름·로컬 저장 표시·가져오기/내보내기·설정 유지. 생성한 새 아이콘 추가.
- 소개 제목/문구, 기간 선택·관리·통계 UI, 큰 통계 카드, 우측 상시 상세 패널 제거.
- 뷰포트 안에 27석과 칠판이 모두 보이는 교실. 가로 여유 공간도 활용하며 문서 전체를 스크롤하지 않음.
- 첨부 이미지와 같은 모둠 배치: 위쪽 왼쪽부터 6·5·4(5명씩, 맨 윗줄 오른쪽 자리만), 아래쪽 3·2·1(4명씩), 칠판은 맨 아래.
- 모둠 이름 클릭 수정, IndexedDB 및 전체 백업에 보존.
- 빈 책상도 표시하되 실제 부동산 레코드는 클릭해서 저장할 때 생성. 자동 예시 학생·계약 없음.
- 미등록 자리번호는 배경처럼 표시. 등록 후 좌측 상단에 작은 선명한 번호 표시.
- 책상에 소유·임대인/임차인/시세. 마우스 또는 키보드 포커스로 상세정보와 시세 그래프. 클릭 시 관리 모달.
- 게임풍 나무 바닥·칠판·창문·사물함·책장·독서 공간, 움직이는 가상 캐릭터와 무작위 말풍선.
- 설정에서 움직임을 끌 수 있으며 OS의 reduced-motion 설정도 존중.
- 모달 Escape 닫기·Tab 포커스 순환. 목록/이력과 긴 입력창은 화면 안의 패널에서 스크롤.

## 보존한 자료

기존 학생/자리/계약/거래/시세 ID와 데이터는 변경하지 않습니다. 기존 기간과 업로드 이미지는 호환성과 백업을 위해 자료 구조에는 남아 있으나 새 화면의 기간 UI와 배경 업로드 기능은 제거했습니다. 모둠명·캐릭터 설정은 교실 표시 설정으로 별도 저장하며 공통 ClassBank JSON 대신 전체 백업에 포함됩니다.

기존 외부 자리번호 또는 27석보다 많은 데이터도 버리지 않습니다. 추가 기록이 있으면 추가 줄을 표시하고 전체 장면을 맞춥니다. 참조 배치의 기본값은 27석입니다. 작은 휴대폰 화면은 전체 교실이 축소되므로 세부정보는 자리를 눌러 확인하는 방식입니다.

## 아이콘

파일: `public/classroom-icon.png`. 내장 image_gen으로 생성한 투명 배경 PNG. 외부 이미지 서비스 요청 없이 로컬 프로젝트 자산으로 사용합니다.

생성 프롬프트:

> Use case: logo-brand. Create a polished playful isometric game icon for a Korean elementary classroom property exchange app. A miniature honey-colored school desk and small mint chair under a simple house-shaped roof, small golden key detail. Charming cozy pixel-inspired 3D toy game asset, clear bold silhouette legible at 48px, soft mint, warm amber and cream, dark indigo edge definition. Centered single cohesive icon, transparent background. No text, no letters, no watermark, no surrounding scenery. Save the generated image as a project-usable PNG.

## 검증

- 기존 도메인/교환/저장 테스트 40개와 배치 검증 7개, 총 47개 통과.
- 브라우저에서 모둠 1 → 별빛 모둠 변경 및 새로고침 보존 확인.
- 2번 책상 클릭 → 최초 소유 정보 등록 → 월세 계약 → 시세 160→190 수정 → 상세 그래프와 소유·임차인 표시 확인.
- 1366×768 화면: document 크기 1366×768, 27개 책상과 칠판 모두 화면 내부.
- 390×844 화면: document 크기 390×844, 27개 책상 모두 화면 내부, 설정/게시 검토 모달 접근 확인.
- 애니메이션 끄기 적용 확인. 기존 자리·매매 정보 보존 확인.
- 게시 버튼은 안내용이며 실제 네트워크 업로드는 없음.

실제 모바일 기기의 터치 사용성 및 모든 브라우저 조합은 별도 확인 대상입니다. 기존 TEST-REPORT.md는 첫 버전의 검증 기록이며, 현재 화면 변경 사항은 이 문서를 우선 참고하세요.
