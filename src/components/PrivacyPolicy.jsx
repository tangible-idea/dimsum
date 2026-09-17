import { useState } from 'react';
import './PrivacyPolicy.css';

export default function PrivacyPolicy({ onBack }) {
  const [lang, setLang] = useState('ko'); // 'ko' | 'en'

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = '/';
    }
  };

  return (
    <div className="pp-wrap">
      <header className="pp-header">
        <button type="button" className="pp-back" onClick={handleBack} aria-label="뒤로 가기">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span>{lang === 'ko' ? '홈으로' : 'Back'}</span>
        </button>

        <div className="pp-brand">MANDU STAND · PRIVACY</div>

        <div className="pp-lang-toggle">
          <button
            type="button"
            className={'pp-lang-btn' + (lang === 'ko' ? ' active' : '')}
            onClick={() => setLang('ko')}
          >
            한국어
          </button>
          <span className="pp-lang-divider">/</span>
          <button
            type="button"
            className={'pp-lang-btn' + (lang === 'en' ? ' active' : '')}
            onClick={() => setLang('en')}
          >
            English
          </button>
        </div>
      </header>

      <main className="pp-content">
        {lang === 'ko' ? (
          <article className="pp-article">
            <h1 className="pp-title">개인정보처리방침</h1>
            <p className="pp-date">최종 수정일: 2026년 9월 17일</p>

            <p className="pp-intro">
              <b>Mandu stand / 딤섬 클리커</b>(이하 &apos;서비스&apos;)는 정보통신망 이용촉진 및 정보보호 등에 관한 법률, 개인정보보호법 등 관련 법령을 준수하며, 이용자의 개인정보를 소중하게 보호하기 위해 다음과 같이 개인정보처리방침을 수립·공개합니다.
            </p>

            <section className="pp-sec">
              <h2>1. 수집하는 개인정보 항목 및 수집 방법</h2>
              <p>서비스는 회원가입, 기기 등록 및 원활한 서비스 제공을 위해 아래와 같은 개인정보를 처리합니다.</p>
              <ul>
                <li>
                  <b>소셜 로그인(Google OAuth) 시:</b>
                  <br />
                  이용자 고유 식별자(Google User ID), 이메일 주소, 이름/닉네임, 프로필 이미지 URL
                </li>
                <li>
                  <b>클리커 기기 연동 및 서비스 이용 시:</b>
                  <br />
                  클리커 기기 고유 코드(Device Code), 총 탭(클릭) 수, 일간/주간 카운트, 랭킹 기록, 친구 목록, 친구 간 전송되는 픽셀 그림 데이터, 기기 사운드 및 언어 설정값
                </li>
                <li>
                  <b>서비스 접속 및 기술 로그:</b>
                  <br />
                  접속 IP 주소, 접속 일시, 브라우저 및 기기 사양, 서비스 이용 기록
                </li>
              </ul>
            </section>

            <section className="pp-sec">
              <h2>2. 개인정보의 수집 및 이용 목적</h2>
              <p>수집된 개인정보는 다음의 목적을 위해서만 이용됩니다.</p>
              <ol>
                <li><b>회원 관리 및 본인 식별:</b> Google 로그인을 통한 사용자 식별, 중복 가입 방지 및 계정 연동</li>
                <li><b>클리커 기기 등록 및 게임 서비스 제공:</b> 물리적 클리커 기기와 계정 간 연동, 누적 탭 수 측정, 다마고치 성장 및 악세서리 보관</li>
                <li><b>랭킹 및 소셜 기능:</b> 주간/역대 랭킹 집계, 친구 추가 및 친구 간 픽셀 그림/신호 전송</li>
                <li><b>서비스 개선 및 오류 대응:</b> 기기 펌웨어 연동 및 통신 오류 진단, 서비스 품질 향상</li>
              </ol>
            </section>

            <section className="pp-sec">
              <h2>3. 개인정보의 보유 및 이용 기간</h2>
              <p>
                서비스는 원칙적으로 개인정보의 수집 및 이용 목적이 달성된 후에는 해당 정보를 지체 없이 파기합니다.
              </p>
              <ul>
                <li><b>회원 탈퇴 시:</b> 회원의 계정 정보 및 연결된 기기 데이터, 랭킹 데이터는 지체 없이 영구 파기됩니다.</li>
                <li><b>기기 등록 해제 시:</b> 기기 식별 코드 및 페어링 기록은 즉시 연결 해제 처리됩니다.</li>
                <li>관련 법령의 규정에 의하여 보존할 필요가 있는 경우, 해당 법령에서 정한 일정 기간 동안 개인정보를 보관합니다.</li>
              </ul>
            </section>

            <section className="pp-sec">
              <h2>4. 개인정보의 제3자 제공 및 외부 위탁</h2>
              <p>
                서비스는 이용자의 동의 없이 개인정보를 외부에 제공하지 않습니다. 다만, 서비스 운영을 위해 필요한 전문 클라우드 인프라를 다음과 같이 이용하고 있습니다.
              </p>
              <div className="pp-table-wrap">
                <table className="pp-table">
                  <thead>
                    <tr>
                      <th>수탁/연동 업체</th>
                      <th>위탁/연동 업무 내용</th>
                      <th>보유 및 이용 기간</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><b>Supabase Inc.</b></td>
                      <td>데이터베이스 호스팅, 인증 관리, 백엔드 API 운영</td>
                      <td>회원 탈퇴 또는 서비스 종료 시까지</td>
                    </tr>
                    <tr>
                      <td><b>Google LLC</b></td>
                      <td>Google OAuth 사용자 간편 로그인 및 신원 인증</td>
                      <td>로그인 인증 시에 한함</td>
                    </tr>
                    <tr>
                      <td><b>MQTT Broker (HiveMQ)</b></td>
                      <td>기기 및 앱 간 실시간 픽셀 메시지·클릭 신호 중계</td>
                      <td>실시간 메시지 전송 후 즉시 소멸</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section className="pp-sec">
              <h2>5. 정보주체의 권리 및 행사 방법</h2>
              <p>
                이용자는 언제든지 자신의 개인정보를 조회하거나 수정할 수 있으며, 서비스 탈퇴(개인정보 삭제)를 요청할 수 있습니다.
              </p>
              <ul>
                <li>앱 또는 웹 서비스 내 설정에서 로그아웃할 수 있습니다.</li>
                <li>계정 삭제 및 데이터 영구 파기를 원하시는 경우 언제든지 고객 문의 이메일로 요청하시면 지체 없이 조치합니다.</li>
              </ul>
            </section>

            <section className="pp-sec">
              <h2>6. 쿠키 및 로컬 저장소(Local Storage) 운용</h2>
              <p>
                서비스는 원활한 서비스 제공을 위해 웹 브라우저의 로컬 저장소(Local Storage) 및 모바일 앱의 안전한 저장 공간을 활용합니다.
              </p>
              <ul>
                <li><b>목적:</b> 로그인 세션 유지(Supabase Auth Token), 최근 연결된 기기 코드, 사운드 설정, 다국어 선택값 보관</li>
                <li><b>거부 방법:</b> 브라우저 설정을 통해 쿠키 및 로컬 데이터를 삭제할 수 있습니다. 다만, 삭제 시 자동 로그인 및 기기 자동 재연결이 제한될 수 있습니다.</li>
              </ul>
            </section>

            <section className="pp-sec">
              <h2>7. 개인정보의 안전성 확보 조치</h2>
              <p>서비스는 개인정보의 도난, 유출, 변조를 방지하기 위해 다음과 같은 보안 조치를 취하고 있습니다.</p>
              <ul>
                <li>모든 네트워크 데이터 전송 시 HTTPS 및 TLS 암호화 프로토콜 적용</li>
                <li>데이터베이스 접근 권한 제어(Row Level Security, RLS)를 통한 인가된 사용자 데이터 격리</li>
                <li>접근 권한 최소화 및 비밀번호 등 민감정보의 비저장(OAuth 전용 인증)</li>
              </ul>
            </section>

            <section className="pp-sec">
              <h2>8. 개인정보 보호책임자 및 문의처</h2>
              <p>개인정보 처리와 관련한 문의사항이나 불만 처리는 아래로 연락 주시기 바랍니다.</p>
              <div className="pp-card-info">
                <p><b>서비스명:</b> Mandu stand / 딤섬 클리커</p>
                <p><b>문의 이메일:</b> support@tangibleidea.com</p>
              </div>
            </section>

            <section className="pp-sec">
              <h2>9. 개인정보처리방침의 변경</h2>
              <p>
                본 개인정보처리방침은 정부 정책 또는 서비스의 변경에 따라 내용이 추가, 삭제 및 수정될 수 있으며, 개정 시 서비스 웹사이트 및 앱 공지를 통해 사전에 안내해 드립니다.
              </p>
            </section>
          </article>
        ) : (
          <article className="pp-article">
            <h1 className="pp-title">Privacy Policy</h1>
            <p className="pp-date">Last updated: September 17, 2026</p>

            <p className="pp-intro">
              <b>Mandu stand / Dimsum Clicker</b> (&quot;we&quot;, &quot;our&quot;, or &quot;the Service&quot;) is committed to protecting your privacy. This Privacy Policy explains how your information is collected, used, and safeguarded when you use our website, mobile application, and connected clicker devices.
            </p>

            <section className="pp-sec">
              <h2>1. Information We Collect</h2>
              <p>We collect information to provide, maintain, and improve our services:</p>
              <ul>
                <li>
                  <b>Google OAuth Sign-In:</b>
                  <br />
                  User ID, email address, name/nickname, and profile picture URL provided by Google.
                </li>
                <li>
                  <b>Clicker Device &amp; Gameplay Data:</b>
                  <br />
                  Unique device code, total tap count, daily/weekly stats, leaderboard records, friends list, pixel drawings exchanged between users, sound and language preferences.
                </li>
                <li>
                  <b>System &amp; Connection Logs:</b>
                  <br />
                  IP address, timestamps, browser/device information, and error diagnostic logs.
                </li>
              </ul>
            </section>

            <section className="pp-sec">
              <h2>2. How We Use Your Information</h2>
              <p>We use the information we collect for the following purposes:</p>
              <ol>
                <li><b>Authentication &amp; Account Management:</b> Identifying users and maintaining secure sessions via Google Sign-In.</li>
                <li><b>Device Pairing &amp; Cloud Sync:</b> Syncing physical clicker hardware with web and mobile apps, tracking progress, and saving virtual pet items.</li>
                <li><b>Leaderboards &amp; Social Features:</b> Computing all-time and weekly rankings, facilitating friend connections, and relaying peer-to-peer pixel drawings.</li>
                <li><b>Reliability &amp; Support:</b> Diagnosing connectivity issues, improving performance, and preventing fraudulent usage.</li>
              </ol>
            </section>

            <section className="pp-sec">
              <h2>3. Data Retention and Deletion</h2>
              <p>
                We retain personal information only for as long as necessary to fulfill the purposes outlined in this policy or as required by law.
              </p>
              <ul>
                <li><b>Account Deletion:</b> When you request account deletion, all associated user data, paired device records, and ranking entries are permanently removed.</li>
                <li><b>Device Unpairing:</b> Unpairing a clicker removes the association between your account and that physical device.</li>
              </ul>
            </section>

            <section className="pp-sec">
              <h2>4. Third-Party Services and Data Processors</h2>
              <p>
                We do not sell your personal data. We utilize reputable third-party cloud infrastructure to operate the Service:
              </p>
              <div className="pp-table-wrap">
                <table className="pp-table">
                  <thead>
                    <tr>
                      <th>Service Provider</th>
                      <th>Purpose</th>
                      <th>Retention Period</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><b>Supabase Inc.</b></td>
                      <td>Cloud database, user authentication, and API hosting</td>
                      <td>Until account deletion</td>
                    </tr>
                    <tr>
                      <td><b>Google LLC</b></td>
                      <td>Google OAuth single sign-on authentication</td>
                      <td>During sign-in authentication</td>
                    </tr>
                    <tr>
                      <td><b>MQTT Broker (HiveMQ)</b></td>
                      <td>Real-time messaging for clicks and pixel drawings</td>
                      <td>Transient (discarded after delivery)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section className="pp-sec">
              <h2>5. Your Rights and Choices</h2>
              <p>
                You have the right to access, update, or delete your personal information. You may:
              </p>
              <ul>
                <li>Sign out of your account at any time in the settings menu.</li>
                <li>Request permanent account deletion and data wipe by contacting us via email.</li>
              </ul>
            </section>

            <section className="pp-sec">
              <h2>6. Cookies and Local Storage</h2>
              <p>
                We use browser Local Storage and app preferences to maintain your authentication state (Supabase Auth token), retain paired device codes, and store local preferences such as language and sound settings.
              </p>
            </section>

            <section className="pp-sec">
              <h2>7. Security Measures</h2>
              <p>
                We implement robust security safeguards, including TLS/HTTPS encryption for data in transit, strict database Row Level Security (RLS) policies, and passwordless authentication through Google OAuth.
              </p>
            </section>

            <section className="pp-sec">
              <h2>8. Contact Us</h2>
              <p>If you have questions, feedback, or data deletion requests regarding this Privacy Policy, please contact:</p>
              <div className="pp-card-info">
                <p><b>Service:</b> Mandu stand / Dimsum Clicker</p>
                <p><b>Email:</b> support@tangibleidea.com</p>
              </div>
            </section>
          </article>
        )}
      </main>

      <footer className="pp-footer">
        <p>© 2026 Mandu stand / Dimsum Clicker. All rights reserved.</p>
        <button type="button" className="pp-footer-back" onClick={handleBack}>
          {lang === 'ko' ? '홈 화면으로 돌아가기 ↑' : 'Back to Home ↑'}
        </button>
      </footer>
    </div>
  );
}
