import Phaser from 'phaser';
import { supabase } from '../lib/supabase';
import { DISH_TYPES, ASSET } from '../lib/shop';

// 게더타운식 메타버스 월드.
// - 내 딤섬 캐릭터는 클릭한 곳으로 이동(거리/속도 기반 tween).
// - 캐릭터 위: 클릭 횟수(total_clicks), 아래: 내 slug.
// - 동기화는 Supabase Realtime "Presence" 단일 경로로 처리한다.
//   클릭할 때마다 목표 좌표를 track() 으로 갱신하면, 다른 접속자는
//   presence 'sync' 에서 그 좌표로 자신이 가진 사본을 tween 한다.
//   (broadcast 'move' 는 한쪽만 아바타를 만든 경우/도달 실패 시 움직임이
//    전파되지 않는 문제가 있어 사용하지 않는다.)
// - 식별은 uid 가 아니라 접속(연결)마다 고유한 clientId 로 한다. 같은 계정으로
//   여러 탭을 열어도 각각 별도 아바타로 보이며, 자기 자신만 제외된다.

// 월드 크기는 Tiled 맵(desert.json: 40x40 타일 * 32px = 1280)에서 결정된다.
let WORLD_W = 1280;
let WORLD_H = 1280;
const SPEED = 260; // px/s
const SPRITE = 60; // 캐릭터 표시 크기(px)
const ROOM = 'space:lobby';

function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'c-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default class WorldScene extends Phaser.Scene {
  constructor() {
    super('WorldScene');
    this.me = null; // { container, sprite, head, foot, tween }
    this.others = new Map(); // clientId -> { container, sprite, head, foot, tween, tx, ty }
    this.channel = null;
    this.clientId = null; // 이 접속의 고유 식별자
    this.state = null; // 내 presence 메타(track 페이로드)
  }

  preload() {
    // Tiled 샘플 맵(desert) — 맵 JSON + 타일셋 이미지
    this.load.tilemapTiledJSON('desert', '/assets/tilemaps/desert.json');
    this.load.image('desert-tiles', '/assets/tilemaps/tmw_desert_spacing.png');
    // 모든 딤섬 텍스처를 파일명 키로 로드(플레이어별 캐릭터 선택용).
    DISH_TYPES.forEach((d) => this.load.image(d.asset, ASSET(d.asset)));
  }

  create() {
    const reg = this.registry.get('player') || {};
    this.clientId = uuid();
    const myAsset = reg.asset || DISH_TYPES[0].asset;
    const myClicks = reg.clicks || 0;
    const mySlug = reg.slug || 'guest';

    this.buildMap();
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);

    // 내 캐릭터
    const start = { x: Phaser.Math.Between(200, WORLD_W - 200), y: Phaser.Math.Between(200, WORLD_H - 200) };
    this.me = this.makeAvatar(start.x, start.y, myAsset, myClicks, mySlug, true);
    this.cameras.main.startFollow(this.me.container, true, 0.1, 0.1);

    // 내 presence 메타(track 으로 보낼 상태)
    this.state = { id: this.clientId, uid: reg.uid, slug: mySlug, asset: myAsset, clicks: myClicks, x: start.x, y: start.y };

    // 클릭 → 이동 + 좌표 공유(broadcast=빠른 이동, presence=후발 접속자 보정)
    this.input.on('pointerdown', (pointer) => {
      const x = Phaser.Math.Clamp(pointer.worldX, 30, WORLD_W - 30);
      const y = Phaser.Math.Clamp(pointer.worldY, 30, WORLD_H - 30);
      this.moveAvatar(this.me, x, y);
      if (this.channel) {
        this.channel.send({ type: 'broadcast', event: 'move', payload: { id: this.clientId, x, y } });
      }
      this.trackPosition(x, y);
    });

    this.setupRealtime();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.channel) supabase.removeChannel(this.channel);
      this.channel = null;
    });
  }

  // ---- 시각 요소 ----
  buildMap() {
    const map = this.make.tilemap({ key: 'desert' });
    // 타일셋 이름('Desert')은 desert.json 의 tileset name 과 일치해야 한다.
    const tiles = map.addTilesetImage('Desert', 'desert-tiles');
    const layer = map.createLayer('Ground', tiles, 0, 0);
    layer.setDepth(-10);
    WORLD_W = map.widthInPixels;
    WORLD_H = map.heightInPixels;
  }

  makeAvatar(x, y, asset, clicks, slug, isMe) {
    const key = this.textures.exists(asset) ? asset : DISH_TYPES[0].asset;
    const sprite = this.add.image(0, 0, key).setDisplaySize(SPRITE, SPRITE);

    const head = this.add.text(0, -SPRITE / 2 - 14, `🖱️ ${clicks}`, {
      fontFamily: 'sans-serif', fontSize: '14px', color: '#fbe36b',
      backgroundColor: 'rgba(0,0,0,0.5)', padding: { x: 6, y: 2 },
    }).setOrigin(0.5);

    const foot = this.add.text(0, SPRITE / 2 + 12, slug, {
      fontFamily: 'sans-serif', fontSize: '12px',
      color: isMe ? '#fbe36b' : '#d6d6e0',
      backgroundColor: 'rgba(0,0,0,0.5)', padding: { x: 6, y: 2 },
    }).setOrigin(0.5);

    const container = this.add.container(x, y, [sprite, head, foot]);
    container.setSize(SPRITE, SPRITE);
    return { container, sprite, head, foot, tween: null, tx: x, ty: y };
  }

  moveAvatar(av, x, y) {
    if (!av) return;
    av.tx = x; av.ty = y;
    if (av.tween) av.tween.stop();
    const dist = Phaser.Math.Distance.Between(av.container.x, av.container.y, x, y);
    av.sprite.setFlipX(x < av.container.x);
    av.tween = this.tweens.add({
      targets: av.container,
      x, y,
      duration: Math.max(120, (dist / SPEED) * 1000),
      ease: 'Linear',
    });
  }

  // ---- 실시간 동기화 (broadcast 빠른 이동 + presence 입장/이탈·보정) ----
  setupRealtime() {
    const channel = supabase.channel(ROOM, {
      config: { presence: { key: this.clientId }, broadcast: { self: false } },
    });
    this.channel = channel;
    console.log('[space] me =', this.clientId, 'room =', ROOM);

    channel
      .on('presence', { event: 'sync' }, () => {
        console.log('[space] presence sync, keys =', Object.keys(channel.presenceState()));
        this.reconcile();
      })
      .on('broadcast', { event: 'move' }, ({ payload }) => {
        console.log('[space] recv move', payload);
        if (!payload || payload.id === this.clientId) return;
        const av = this.others.get(payload.id);
        if (av) this.moveAvatar(av, payload.x, payload.y); // 없으면 presence 가 곧 생성
      })
      .subscribe((status, err) => {
        console.log('[space] channel status =', status, err || '');
        if (status === 'SUBSCRIBED') channel.track(this.state);
      });
  }

  // 클릭 목표 좌표를 presence 메타에 반영 → 다른 접속자에게 전파됨
  trackPosition(x, y) {
    if (!this.channel) return;
    this.state = { ...this.state, x, y };
    this.channel.track(this.state);
  }

  // presence 상태로 원격 플레이어 add/remove/move + 라벨 갱신
  reconcile() {
    if (!this.channel) return;
    const state = this.channel.presenceState();
    const present = new Set();

    Object.values(state).forEach((entries) => {
      const meta = entries[entries.length - 1]; // 최신 메타
      const id = meta?.id;
      if (!id || id === this.clientId) return; // 자기 자신 제외
      present.add(id);

      let av = this.others.get(id);
      if (!av) {
        console.log('[space] add player', id, meta.slug);
        av = this.makeAvatar(meta.x ?? WORLD_W / 2, meta.y ?? WORLD_H / 2, meta.asset, meta.clicks ?? 0, meta.slug ?? 'guest', false);
        this.others.set(id, av);
      } else {
        av.head.setText(`🖱️ ${meta.clicks ?? 0}`);
        av.foot.setText(meta.slug ?? 'guest');
        // 새 목표 좌표면 부드럽게 이동
        if (meta.x != null && meta.y != null && (meta.x !== av.tx || meta.y !== av.ty)) {
          this.moveAvatar(av, meta.x, meta.y);
        }
      }
    });

    // 떠난 플레이어 제거
    for (const [id, av] of this.others) {
      if (!present.has(id)) {
        if (av.tween) av.tween.stop();
        av.container.destroy();
        this.others.delete(id);
      }
    }

    // 외부(React HUD)에서 인원수 표시용
    const count = present.size + 1;
    this.registry.set('headcount', count);
    this.game.events.emit('headcount', count);
  }

  // 외부에서 내 클릭수(total_clicks) 갱신 시 호출
  setMyClicks(n) {
    if (this.me) this.me.head.setText(`🖱️ ${n}`);
    if (this.state) { this.state.clicks = n; this.channel?.track(this.state); }
  }
}
