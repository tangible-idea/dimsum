import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

// 진입 분기: /space (또는 ?mode=space) 는 메타버스, 그 외는 기존 가게 앱.
// App 을 임포트하면 deviceCode 파서가 즉시 실행되므로(`/space` 를 기기코드로 오해),
// 메타버스에서는 App 을 아예 임포트하지 않도록 동적 import 로 분기한다.
const params = new URLSearchParams(location.search);
const isSpace = location.pathname.replace(/\/+$/, '').endsWith('/space') || params.get('mode') === 'space';

const root = createRoot(document.getElementById('root'));

const mount = (Component) =>
  root.render(
    <React.StrictMode>
      <Component />
    </React.StrictMode>
  );

if (isSpace) {
  import('./Space.jsx').then(({ default: Space }) => mount(Space));
} else {
  import('./App.jsx').then(({ default: App }) => mount(App));
}
