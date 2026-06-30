import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

// 진입 분기: /space (또는 ?mode=space) 는 메타버스, 그 외는 기존 가게 앱.
// App 을 임포트하면 deviceCode 파서가 즉시 실행되므로(`/space` 를 기기코드로 오해),
// 메타버스에서는 App 을 아예 임포트하지 않도록 동적 import 로 분기한다.
const params = new URLSearchParams(location.search);
const isSpace = location.pathname.replace(/\/+$/, '').endsWith('/space') || params.get('mode') === 'space';

const root = createRoot(document.getElementById('root'));

if (isSpace) {
  // 메타버스는 StrictMode 로 감싸지 않는다. dev 의 이중 마운트/언마운트가
  // Phaser 게임과 Supabase Realtime 채널을 만들었다 부쉈다 하며 동기화를 깨기 때문.
  import('./Space.jsx').then(({ default: Space }) => root.render(<Space />));
} else {
  import('./App.jsx').then(({ default: App }) =>
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    )
  );
}
