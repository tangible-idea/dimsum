import Phaser from 'phaser';
import { supabase } from '../lib/supabase';
import { DISH_TYPES, ASSET } from '../lib/shop';

// 게더타운식 메타버스 월드.
// - 내 딤섬 캐릭터는 클릭한 곳으로 이동(거리/속도 기반 tween).
// - 캐릭터 위: 클릭 횟수(total_clicks), 아래: 내 slug.
// - Supabase Realtime(Presence + Broadcast)로 다른 플레이어와 위치 동기화.
//   * presence: 입장/퇴장 + 최신 좌표 스냅샷(신규 입장자가 기존 위치를 받도록)
//   * broadcast 'move': 클릭 목표 좌표를 전파 → 수신측에서 동일하게 tween

// 월드 크기는 Tiled 맵(desert.json: 40x40 타일 * 32px = 1280)에서 결정된다.
let WORLD_W = 1280;
let WORLD_H = 1280;
const SPEED = 260; // px/s
const SPRITE = 60; // 캐릭터 표시 크기(px)
const ROOM = 'space:lobby';

export default class WorldScene extends Phaser.Scene {
  constructor() {
    super('WorldScene');
    this.me = null; // { container, sprite, head, foot, target }
    this.others = new Map(); // uid -> { container, sprite, head, foot, target, meta }
    this.channel = null;
    this.myId = null;
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
    this.myId = reg.uid;
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

    // 클릭 → 이동 + 전파
    this.input.on('pointerdown', (pointer) => {
      const x = Phaser.Math.Clamp(pointer.worldX, 30, WORLD_W - 30);
      const y = Phaser.Math.Clamp(pointer.worldY, 30, WORLD_H - 30);
      this.moveAvatar(this.me, x, y);
      this.broadcastMove(x, y);
    });

    this.setupRealtime({ uid: this.myId, asset: myAsset, clicks: myClicks, slug: mySlug, x: start.x, y: start.y });

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
    return { container, sprite, head, foot, tween: null };
  }

  moveAvatar(av, x, y) {
    if (!av) return;
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

  // ---- 실시간 동기화 ----
  setupRealtime(initial) {
    const channel = supabase.channel(ROOM, {
      config: { presence: { key: initial.uid } },
    });
    this.channel = channel;

    channel
      .on('presence', { event: 'sync' }, () => this.reconcile())
      .on('broadcast', { event: 'move' }, ({ payload }) => {
        if (!payload || payload.uid === this.myId) return;
        const av = this.others.get(payload.uid);
        if (av) this.moveAvatar(av, payload.x, payload.y);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') channel.track(initial);
      });
  }

  broadcastMove(x, y) {
    if (!this.channel) return;
    this.channel.send({ type: 'broadcast', event: 'move', payload: { uid: this.myId, x, y } });
    // 신규 입장자가 최신 위치를 받도록 presence 좌표도 갱신
    this.channel.track({
      uid: this.myId, x, y,
      asset: this.registry.get('player')?.asset,
      clicks: this.registry.get('player')?.clicks,
      slug: this.registry.get('player')?.slug,
    });
  }

  // presence 상태로 원격 플레이어 add/remove + 라벨 갱신
  reconcile() {
    if (!this.channel) return;
    const state = this.channel.presenceState();
    const present = new Set();

    Object.values(state).forEach((entries) => {
      const meta = entries[entries.length - 1]; // 최신 메타
      const uid = meta?.uid;
      if (!uid || uid === this.myId) return;
      present.add(uid);

      let av = this.others.get(uid);
      if (!av) {
        av = this.makeAvatar(meta.x ?? WORLD_W / 2, meta.y ?? WORLD_H / 2, meta.asset, meta.clicks ?? 0, meta.slug ?? 'guest', false);
        this.others.set(uid, av);
      } else {
        // 라벨만 최신화(위치는 broadcast move 로 부드럽게 처리)
        av.head.setText(`🖱️ ${meta.clicks ?? 0}`);
        av.foot.setText(meta.slug ?? 'guest');
      }
    });

    // 떠난 플레이어 제거
    for (const [uid, av] of this.others) {
      if (!present.has(uid)) {
        av.container.destroy();
        this.others.delete(uid);
      }
    }

    // 외부(React HUD)에서 인원수 표시용
    this.registry.set('headcount', present.size + 1);
    this.game.events.emit('headcount', present.size + 1);
  }

  // 외부에서 내 클릭수(total_clicks) 갱신 시 호출
  setMyClicks(n) {
    if (this.me) this.me.head.setText(`🖱️ ${n}`);
  }
}
