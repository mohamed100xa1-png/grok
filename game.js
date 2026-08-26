(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const mapCanvas = document.getElementById('mapCanvas');
  const mapCtx = mapCanvas.getContext('2d');

  const ui = {
    startOverlay: document.getElementById('startOverlay'),
    startButton: document.getElementById('startButton'),
    guideButton: document.getElementById('guideButton'),
    pauseOverlay: document.getElementById('pauseOverlay'),
    pauseButton: document.getElementById('pauseButton'),
    resumeButton: document.getElementById('resumeButton'),
    soundButton: document.getElementById('soundButton'),
    resetButton: document.getElementById('resetButton'),
    toast: document.getElementById('toast'),
    toastText: document.getElementById('toastText'),
    sessionStatus: document.getElementById('sessionStatus'),
    sessionClock: document.getElementById('sessionClock'),
    speedValue: document.getElementById('speedValue'),
    gearValue: document.getElementById('gearValue'),
    gearStack: document.querySelectorAll('.gear-stack span'),
    rpmValue: document.getElementById('rpmValue'),
    rpmFill: document.getElementById('rpmFill'),
    lapValue: document.getElementById('lapValue'),
    lapTime: document.getElementById('lapTime'),
    bestTime: document.getElementById('bestTime'),
    distanceValue: document.getElementById('distanceValue'),
    tractionValue: document.getElementById('tractionValue'),
    tireValue: document.getElementById('tireValue'),
    gForceValue: document.getElementById('gForceValue'),
    driveState: document.getElementById('driveState'),
    surfaceState: document.getElementById('surfaceState'),
    cornerDistance: document.getElementById('cornerDistance'),
    cornerName: document.getElementById('cornerName'),
    cornerBar: document.getElementById('cornerBar'),
    cornerNote: document.getElementById('cornerNote'),
    mapCoordinate: document.getElementById('mapCoordinate'),
    positionValue: document.getElementById('positionValue'),
    raceLapValue: document.getElementById('raceLapValue'),
    raceStatusText: document.getElementById('raceStatusText'),
    nitroValue: document.getElementById('nitroValue'),
    nitroFill: document.getElementById('nitroFill')
  };

  const TAU = Math.PI * 2;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const wrap = (value, max) => ((value % max) + max) % max;

  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let mapWidth = 0;
  let mapHeight = 0;
  let mapRatio = 1;
  let started = false;
  let paused = false;
  let muted = false;
  let toastTimer = null;
  let lastFrame = performance.now();
  let lastHudUpdate = 0;
  let audio = null;

  const controls = {
    throttle: false,
    brake: false,
    left: false,
    right: false,
    handbrake: false,
    nitro: false
  };

  const state = {
    x: 0,
    y: 0,
    heading: 0,
    vx: 0,
    vy: 0,
    steer: 0,
    s: 0,
    lastS: 0,
    lap: 1,
    lapTime: 0,
    lapStartedAt: 0,
    bestLap: null,
    distance: 0,
    offroadTime: 0,
    damage: 0,
    tireTemp: 72,
    gForce: 0,
    traction: 100,
    nitro: 100,
    nitroActive: false,
    finished: false,
    lastAccel: 0,
    lastYaw: 0,
    projection: null,
    position: 1
  };

  const cameraModes = ['chase', 'hood', 'bumper', 'cockpit'];
  let cameraMode = 'chase';
  let opponents = [];

  // A deliberately hand-shaped, closed downtown route. The extra S-bend in the
  // east section makes steering input matter instead of producing an oval.
  const controlPoints = [
    { x: -11, y: -72 },
    { x: 24, y: -78 },
    { x: 57, y: -62 },
    { x: 77, y: -36 },
    { x: 72, y: -8 },
    { x: 45, y: 2 },
    { x: 26, y: 10 },
    { x: 40, y: 30 },
    { x: 67, y: 50 },
    { x: 44, y: 70 },
    { x: 8, y: 68 },
    { x: -27, y: 58 },
    { x: -57, y: 38 },
    { x: -70, y: 7 },
    { x: -51, y: -13 },
    { x: -76, y: -40 },
    { x: -47, y: -65 }
  ];

  const corners = [
    { at: 0.085, name: 'PINE SWEEPER', note: 'Late apex · stay planted' },
    { at: 0.205, name: 'NORTH HAIRPIN', note: 'Heavy brake · first apex' },
    { at: 0.355, name: 'ECHO LEFT', note: 'Trail brake · release early' },
    { at: 0.515, name: 'SUMMIT KINK', note: 'Blind crest · eyes up' },
    { at: 0.675, name: 'FOREST RIGHT', note: 'Carry momentum · clean exit' },
    { at: 0.825, name: 'LOWER SWITCHBACK', note: 'Rotate the rear · feed power' }
  ];

  let track = [];
  let trackLength = 1;
  let scenery = [];
  let terrainPatches = [];
  let guardrails = [];
  let randomSeed = 314159;

  function random() {
    randomSeed = (randomSeed * 1664525 + 1013904223) >>> 0;
    return randomSeed / 4294967296;
  }

  function catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return {
      x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
      y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
    };
  }

  function normalise(x, y) {
    const length = Math.hypot(x, y) || 1;
    return { x: x / length, y: y / length };
  }

  function buildTrack() {
    const samples = [];
    const steps = 18;
    for (let i = 0; i < controlPoints.length; i += 1) {
      const p0 = controlPoints[(i - 1 + controlPoints.length) % controlPoints.length];
      const p1 = controlPoints[i];
      const p2 = controlPoints[(i + 1) % controlPoints.length];
      const p3 = controlPoints[(i + 2) % controlPoints.length];
      for (let step = 0; step < steps; step += 1) {
        samples.push(catmullRom(p0, p1, p2, p3, step / steps));
      }
    }

    let total = 0;
    for (let i = 0; i < samples.length; i += 1) {
      const previous = samples[(i - 1 + samples.length) % samples.length];
      const next = samples[(i + 1) % samples.length];
      const tangent = normalise(next.x - previous.x, next.y - previous.y);
      const curvature = Math.abs(Math.atan2(next.y - samples[i].y, next.x - samples[i].x) - Math.atan2(samples[i].y - previous.y, samples[i].x - previous.x));
      samples[i].tangent = tangent;
      samples[i].normal = { x: -tangent.y, y: tangent.x };
      samples[i].width = 8.15 + Math.sin(i * 0.033) * 0.17;
      samples[i].curvature = Math.min(Math.PI, curvature);
      samples[i].s = total;
      const nextPoint = samples[(i + 1) % samples.length];
      total += Math.hypot(nextPoint.x - samples[i].x, nextPoint.y - samples[i].y);
    }

    track = samples;
    trackLength = total;
    randomSeed = 314159;

    terrainPatches = [];
    for (let i = 0; i < 115; i += 1) {
      terrainPatches.push({
        x: -120 + random() * 240,
        y: -118 + random() * 236,
        radius: 1.8 + random() * 7.5,
        tone: random()
      });
    }

    scenery = [];
    for (let i = 0; i < track.length; i += 3) {
      const p = track[i];
      const side = random() > 0.5 ? 1 : -1;
      const offset = p.width * 0.5 + 4.2 + random() * 8.5;
      const along = (random() - 0.5) * 2.2;
      const size = 0.7 + random() * 1.25;
      const x = p.x + p.normal.x * side * offset + p.tangent.x * along;
      const y = p.y + p.normal.y * side * offset + p.tangent.y * along;
      const roll = random();
      scenery.push({
        x,
        y,
        size,
        side,
        kind: roll < 0.40 ? 'building' : roll < 0.57 ? 'streetlight' : roll < 0.72 ? 'barrier' : roll < 0.9 ? 'tree' : 'rock',
        hue: random()
      });
      if (random() > 0.82) {
        const offsetTwo = p.width * 0.5 + 5 + random() * 7;
        scenery.push({
          x: p.x - p.normal.x * side * offsetTwo + p.tangent.x * (random() - 0.5) * 3,
          y: p.y - p.normal.y * side * offsetTwo + p.tangent.y * (random() - 0.5) * 3,
          size: 0.55 + random() * 0.85,
          side: -side,
          kind: random() < 0.62 ? 'building' : 'streetlight',
          hue: random()
        });
      }
    }

    guardrails = [];
    [25, 56, 93, 131, 176, 222, 268].forEach((index, segmentIndex) => {
      const i = index % track.length;
      const p = track[i];
      const p2 = track[(i + 15) % track.length];
      const side = segmentIndex % 2 === 0 ? 1 : -1;
      guardrails.push({ i, p, p2, side, length: 15 });
    });

    // Seven traffic opponents make the position indicator meaningful and add
    // moving headlights to the city loop. They follow the same centerline but
    // have different pace, so a clean line can change the order.
    opponents = [];
    for (let i = 0; i < 7; i += 1) {
      opponents.push({
        s: trackLength * (0.075 + i * 0.115),
        pace: 25.5 + random() * 8.5,
        lane: (random() - 0.5) * 1.45,
        color: ['#b92f34', '#b6b7ad', '#d18b3d', '#3d79a4', '#777d82', '#d8d6c6', '#27303a'][i],
        progress: trackLength * (0.075 + i * 0.115),
        phase: random() * TAU
      });
    }
  }

  function resetCar(showToast = false) {
    const start = track[0];
    state.x = start.x;
    state.y = start.y;
    state.heading = Math.atan2(start.tangent.y, start.tangent.x);
    state.vx = 0;
    state.vy = 0;
    state.steer = 0;
    state.s = 0;
    state.lastS = 0;
    state.lap = 1;
    state.lapTime = 0;
    state.lapStartedAt = started ? performance.now() : 0;
    state.distance = 0;
    state.offroadTime = 0;
    state.damage = 0;
    state.tireTemp = 72;
    state.gForce = 0;
    state.traction = 100;
    state.nitro = 100;
    state.nitroActive = false;
    state.finished = false;
    state.position = 1;
    state.lastAccel = 0;
    state.lastYaw = 0;
    state.projection = nearestOnTrack(state.x, state.y);
    if (showToast) showToastMessage('CAR RESET · GRID POSITION RESTORED');
  }

  function nearestOnTrack(x, y) {
    let best = null;
    for (let i = 0; i < track.length; i += 1) {
      const a = track[i];
      const b = track[(i + 1) % track.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSquared = dx * dx + dy * dy || 1;
      const ratio = clamp(((x - a.x) * dx + (y - a.y) * dy) / lengthSquared, 0, 1);
      const pointX = a.x + dx * ratio;
      const pointY = a.y + dy * ratio;
      const diffX = x - pointX;
      const diffY = y - pointY;
      const distanceSquared = diffX * diffX + diffY * diffY;
      if (!best || distanceSquared < best.distanceSquared) {
        const tangent = normalise(dx, dy);
        const lateral = tangent.x * diffY - tangent.y * diffX;
        const segmentLength = Math.sqrt(lengthSquared);
        best = {
          point: { x: pointX, y: pointY },
          tangent,
          normal: { x: -tangent.y, y: tangent.x },
          lateral,
          distanceSquared,
          distance: Math.sqrt(distanceSquared),
          width: lerp(a.width, b.width, ratio),
          index: i,
          s: wrap(a.s + segmentLength * ratio, trackLength)
        };
      }
    }
    return best;
  }

  function localVelocity() {
    const forward = { x: Math.cos(state.heading), y: Math.sin(state.heading) };
    const right = { x: -forward.y, y: forward.x };
    return {
      forward,
      right,
      forwardSpeed: state.vx * forward.x + state.vy * forward.y,
      lateralSpeed: state.vx * right.x + state.vy * right.y
    };
  }

  function updatePhysics(dt, now) {
    const before = localVelocity();
    const projectionBefore = nearestOnTrack(state.x, state.y);
    state.projection = projectionBefore;
    const halfRoad = projectionBefore.width * 0.5;
    const onRoad = Math.abs(projectionBefore.lateral) < halfRoad * 1.01;
    const roadRatio = clamp(Math.abs(projectionBefore.lateral) / halfRoad, 0, 2);

    let forwardSpeed = before.forwardSpeed;
    let lateralSpeed = before.lateralSpeed;
    const steeringInput = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
    state.steer += (steeringInput - state.steer) * Math.min(1, dt * 10);

    const throttle = controls.throttle ? 1 : 0;
    const braking = controls.brake ? 1 : 0;
    const reverse = braking && forwardSpeed < 0.75;
    const grip = onRoad ? (controls.handbrake ? 2.0 : 8.6) : 1.05;
    const nitroEngaged = controls.nitro && throttle && state.nitro > 0 && forwardSpeed > 3;
    state.nitroActive = nitroEngaged;
    const maxSpeed = onRoad ? (nitroEngaged ? 73 : 59) : 16;
    let engineForce = 0;

    if (throttle) {
      if (forwardSpeed < -0.7) {
        engineForce = 7.5;
      } else {
        const load = clamp(Math.max(0, forwardSpeed) / maxSpeed, 0, 1);
        engineForce = 12.3 * (1 - load * 0.68);
      }
    }

    if (braking && !reverse) {
      engineForce -= Math.min(25, 19 + Math.abs(forwardSpeed) * 0.12);
    } else if (reverse) {
      engineForce -= 6.4;
    }

    if (nitroEngaged) {
      engineForce += 9.2;
      state.nitro = clamp(state.nitro - 24 * dt, 0, 100);
    } else {
      state.nitro = clamp(state.nitro + (controls.nitro ? 0 : 3.2) * dt, 0, 100);
    }

    const rolling = onRoad ? 0.22 : 1.65;
    const aerodynamicDrag = onRoad ? 0.0105 * forwardSpeed * Math.abs(forwardSpeed) : 0.068 * forwardSpeed * Math.abs(forwardSpeed);
    const rollingDrag = rolling * Math.sign(forwardSpeed);
    const oldForwardSpeed = forwardSpeed;
    forwardSpeed += (engineForce - aerodynamicDrag - rollingDrag) * dt;
    forwardSpeed = clamp(forwardSpeed, -9, maxSpeed);

    const steeringAngle = state.steer * 0.54;
    const wheelbase = 2.68;
    let yawRate = Math.abs(forwardSpeed) > 0.05
      ? (forwardSpeed / wheelbase) * Math.tan(steeringAngle) * (0.23 + 0.77 * clamp(Math.abs(forwardSpeed) / 12, 0, 1))
      : 0;
    if (controls.handbrake) yawRate *= 1.24;
    if (!onRoad) yawRate *= 0.63;

    // Lateral tire relaxation: turning rotates the chassis, while grip pulls
    // the velocity vector back into alignment. Handbrake deliberately loosens it.
    lateralSpeed *= Math.max(0, 1 - grip * dt);
    if (controls.handbrake && Math.abs(forwardSpeed) > 8) {
      lateralSpeed += steeringAngle * Math.abs(forwardSpeed) * 0.12 * dt;
    }

    state.heading += yawRate * dt;
    const forward = { x: Math.cos(state.heading), y: Math.sin(state.heading) };
    const right = { x: -forward.y, y: forward.x };
    state.vx = forward.x * forwardSpeed + right.x * lateralSpeed;
    state.vy = forward.y * forwardSpeed + right.y * lateralSpeed;
    state.x += state.vx * dt;
    state.y += state.vy * dt;
    state.distance += Math.abs(forwardSpeed) * dt;
    state.lastAccel = (forwardSpeed - oldForwardSpeed) / Math.max(dt, 0.001);
    state.lastYaw = yawRate;
    state.gForce = clamp(Math.hypot(state.lastAccel, yawRate * forwardSpeed) / 9.81, 0, 1.7);

    const projectionAfter = nearestOnTrack(state.x, state.y);
    state.projection = projectionAfter;
    state.s = projectionAfter.s;
    const currentlyOnRoad = Math.abs(projectionAfter.lateral) < projectionAfter.width * 0.5;
    if (!currentlyOnRoad) {
      state.offroadTime += dt;
      state.damage = clamp(state.damage + Math.max(0, Math.abs(projectionAfter.lateral) - projectionAfter.width * 0.5) * dt * 0.22, 0, 1);
    } else {
      state.offroadTime = Math.max(0, state.offroadTime - dt * 0.7);
    }

    state.traction = clamp(100 - (currentlyOnRoad ? Math.abs(lateralSpeed) * 5.2 : 44 + roadRatio * 16) - state.damage * 28, 19, 100);
    state.tireTemp = clamp(state.tireTemp + (Math.abs(forwardSpeed) * 0.018 + state.gForce * 0.9) * dt - (currentlyOnRoad ? 0.09 : 0.03) * dt, 56, 119);

    if (state.lastS > trackLength * 0.78 && state.s < trackLength * 0.22 && state.distance > trackLength * 0.55) {
      const completed = state.lapTime;
      if (completed > 5) {
        if (!state.bestLap || completed < state.bestLap) state.bestLap = completed;
        showToastMessage(`LAP ${String(state.lap).padStart(2, '0')} COMPLETE · ${formatTime(completed)}`);
      }
      if (state.lap >= 3) {
        state.finished = true;
        state.nitroActive = false;
        paused = true;
        showToastMessage(`FINISH LINE · P${state.position} · ${formatTime(completed)}`);
      } else {
        state.lap += 1;
        state.lapTime = 0;
        state.lapStartedAt = now;
      }
    }
    state.lastS = state.s;
    state.lapTime = (now - state.lapStartedAt) / 1000;
    updateOpponents(dt);

    updateAudio(forwardSpeed, yawRate);
  }

  function updateOpponents(dt) {
    const playerProgress = (state.lap - 1) * trackLength + state.s;
    for (const opponent of opponents) {
      const paceVariation = 1 + Math.sin(performance.now() * 0.0007 + opponent.phase) * 0.035;
      opponent.progress += opponent.pace * paceVariation * dt;
      opponent.s = wrap(opponent.progress, trackLength);
    }
    state.position = 1 + opponents.filter((opponent) => opponent.progress > playerProgress).length;
  }

  function resizeCanvases() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * pixelRatio);
    canvas.height = Math.floor(height * pixelRatio);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    const mapRect = mapCanvas.getBoundingClientRect();
    mapWidth = Math.max(1, mapRect.width);
    mapHeight = Math.max(1, mapRect.height);
    mapRatio = Math.min(window.devicePixelRatio || 1, 2);
    mapCanvas.width = Math.floor(mapWidth * mapRatio);
    mapCanvas.height = Math.floor(mapHeight * mapRatio);
    mapCtx.setTransform(mapRatio, 0, 0, mapRatio, 0, 0);
  }

  function traceTrack(targetCtx) {
    targetCtx.beginPath();
    targetCtx.moveTo(track[0].x, track[0].y);
    for (let i = 1; i < track.length; i += 1) targetCtx.lineTo(track[i].x, track[i].y);
    targetCtx.closePath();
  }

  function drawGround(targetCtx) {
    const ground = targetCtx.createLinearGradient(-120, -130, 130, 130);
    ground.addColorStop(0, '#2a3943');
    ground.addColorStop(0.47, '#1a2831');
    ground.addColorStop(1, '#0d171f');
    targetCtx.fillStyle = ground;
    targetCtx.fillRect(-220, -220, 440, 440);

    targetCtx.save();
    targetCtx.globalAlpha = 0.16;
    for (const patch of terrainPatches) {
      targetCtx.fillStyle = patch.tone > 0.58 ? '#35444c' : '#121e26';
      targetCtx.beginPath();
      targetCtx.ellipse(patch.x, patch.y, patch.radius * 1.9, patch.radius, patch.tone * TAU, 0, TAU);
      targetCtx.fill();
    }
    targetCtx.globalAlpha = 0.13;
    targetCtx.strokeStyle = '#738a98';
    targetCtx.lineWidth = 0.08;
    for (let i = -160; i <= 160; i += 8) {
      targetCtx.beginPath();
      targetCtx.moveTo(i, -150);
      targetCtx.lineTo(i + 35, 150);
      targetCtx.stroke();
    }
    targetCtx.restore();
  }

  function drawTrack(targetCtx) {
    targetCtx.save();
    targetCtx.lineCap = 'round';
    targetCtx.lineJoin = 'round';

    traceTrack(targetCtx);
    targetCtx.shadowColor = 'rgba(4, 8, 7, .56)';
    targetCtx.shadowBlur = 2.2;
    targetCtx.strokeStyle = '#111b1a';
    targetCtx.lineWidth = 11.3;
    targetCtx.stroke();
    targetCtx.shadowBlur = 0;

    traceTrack(targetCtx);
    targetCtx.strokeStyle = '#ad9d78';
    targetCtx.lineWidth = 10.15;
    targetCtx.stroke();
    traceTrack(targetCtx);
    targetCtx.strokeStyle = '#292f31';
    targetCtx.lineWidth = 9.2;
    targetCtx.stroke();
    traceTrack(targetCtx);
    targetCtx.strokeStyle = '#343a3b';
    targetCtx.lineWidth = 8.28;
    targetCtx.stroke();

    // Faint road texture follows the centerline rather than sitting as a flat fill.
    traceTrack(targetCtx);
    targetCtx.setLineDash([0.22, 0.72]);
    targetCtx.strokeStyle = 'rgba(183, 184, 160, .19)';
    targetCtx.lineWidth = 0.07;
    targetCtx.stroke();
    targetCtx.setLineDash([]);

    // Alternating red/cream kerbs on the usable edge of the asphalt.
    targetCtx.lineWidth = 0.43;
    for (let i = 0; i < track.length; i += 2) {
      const a = track[i];
      const b = track[(i + 2) % track.length];
      const leftA = { x: a.x + a.normal.x * a.width * 0.5, y: a.y + a.normal.y * a.width * 0.5 };
      const leftB = { x: b.x + b.normal.x * b.width * 0.5, y: b.y + b.normal.y * b.width * 0.5 };
      const rightA = { x: a.x - a.normal.x * a.width * 0.5, y: a.y - a.normal.y * a.width * 0.5 };
      const rightB = { x: b.x - b.normal.x * b.width * 0.5, y: b.y - b.normal.y * b.width * 0.5 };
      targetCtx.strokeStyle = (Math.floor(i / 2) % 2 === 0) ? '#d0644f' : '#e2d5b6';
      targetCtx.beginPath(); targetCtx.moveTo(leftA.x, leftA.y); targetCtx.lineTo(leftB.x, leftB.y); targetCtx.stroke();
      targetCtx.beginPath(); targetCtx.moveTo(rightA.x, rightA.y); targetCtx.lineTo(rightB.x, rightB.y); targetCtx.stroke();
    }

    // A single, low-contrast center dash gives the eye a reference at speed.
    traceTrack(targetCtx);
    targetCtx.setLineDash([2.4, 5.5]);
    targetCtx.strokeStyle = 'rgba(221, 213, 179, .35)';
    targetCtx.lineWidth = 0.075;
    targetCtx.stroke();
    targetCtx.setLineDash([]);

    drawStartLine(targetCtx);
    targetCtx.restore();
  }

  function drawStartLine(targetCtx) {
    const p = track[0];
    targetCtx.save();
    targetCtx.translate(p.x, p.y);
    targetCtx.rotate(Math.atan2(p.tangent.y, p.tangent.x));
    const size = p.width / 0.62;
    for (let i = -4; i < 5; i += 1) {
      targetCtx.fillStyle = i % 2 === 0 ? '#ece7d1' : '#31383a';
      targetCtx.fillRect(-0.52, i * 0.62 - size * 0.5, 1.04, 0.62);
    }
    targetCtx.restore();
  }

  function drawScenery(targetCtx) {
    for (const item of scenery) {
      const distance = Math.hypot(item.x - state.x, item.y - state.y);
      if (distance > 125) continue;
      if (item.kind === 'building') drawBuilding(targetCtx, item);
      else if (item.kind === 'streetlight') drawStreetlight(targetCtx, item);
      else if (item.kind === 'barrier') drawBarrier(targetCtx, item);
      else if (item.kind === 'tree') drawTree(targetCtx, item);
      else drawRock(targetCtx, item);
    }

    for (const rail of guardrails) {
      drawGuardrail(targetCtx, rail);
    }
  }

  function drawOpponents(targetCtx) {
    for (const opponent of opponents) {
      const playerProgress = state.s + (state.lap - 1) * trackLength;
      const distance = Math.abs(opponent.progress - playerProgress) % trackLength;
      const wrappedDistance = Math.min(distance, trackLength - distance);
      if (wrappedDistance > 118) continue;
      const index = Math.floor(wrap(opponent.s, trackLength) / trackLength * track.length) % track.length;
      const p = track[index];
      const x = p.x + p.normal.x * opponent.lane;
      const y = p.y + p.normal.y * opponent.lane;
      drawTrafficCar(targetCtx, x, y, p.tangent, opponent.color);
    }
  }

  function drawTrafficCar(targetCtx, x, y, tangent, color) {
    targetCtx.save();
    targetCtx.translate(x, y);
    targetCtx.rotate(Math.atan2(tangent.y, tangent.x));
    targetCtx.fillStyle = 'rgba(0, 0, 0, .45)';
    targetCtx.beginPath();
    targetCtx.ellipse(.35, .55, 1.35, 2.7, 0, 0, TAU);
    targetCtx.fill();
    targetCtx.fillStyle = '#101416';
    roundedRect(targetCtx, -1.02, -2.48, 2.04, 4.9, .46);
    targetCtx.fill();
    targetCtx.fillStyle = color;
    roundedRect(targetCtx, -.84, -2.35, 1.68, 4.56, .38);
    targetCtx.fill();
    targetCtx.fillStyle = 'rgba(10, 26, 31, .88)';
    roundedRect(targetCtx, -.68, -.92, 1.36, 1.5, .28);
    targetCtx.fill();
    targetCtx.fillStyle = '#ffeec5';
    targetCtx.fillRect(-.62, -2.21, .35, .12);
    targetCtx.fillRect(.27, -2.21, .35, .12);
    targetCtx.fillStyle = '#e84e45';
    targetCtx.fillRect(-.63, 2.05, .38, .13);
    targetCtx.fillRect(.25, 2.05, .38, .13);
    targetCtx.restore();
  }

  function drawBuilding(targetCtx, item) {
    const size = item.size;
    const w = 2.4 + size * 2.45;
    const h = 2.2 + size * 3.1;
    targetCtx.save();
    targetCtx.translate(item.x, item.y);
    targetCtx.rotate((item.hue - .5) * .28);
    targetCtx.globalAlpha = clamp(1.14 - Math.hypot(item.x - state.x, item.y - state.y) / 150, .38, .88);
    targetCtx.fillStyle = 'rgba(1, 5, 8, .52)';
    targetCtx.beginPath();
    targetCtx.ellipse(.8, .9, w * .7, h * .66, 0, 0, TAU);
    targetCtx.fill();
    targetCtx.fillStyle = item.hue > .55 ? '#344450' : '#2a3944';
    roundedRect(targetCtx, -w * .5, -h * .5, w, h, .22);
    targetCtx.fill();
    targetCtx.strokeStyle = 'rgba(147, 176, 188, .38)';
    targetCtx.lineWidth = .09;
    targetCtx.stroke();
    targetCtx.fillStyle = item.hue > .45 ? 'rgba(87, 170, 196, .52)' : 'rgba(208, 156, 91, .42)';
    for (let row = -1; row <= 1; row += 1) {
      for (let col = -1; col <= 1; col += 1) {
        if ((row + col + Math.floor(item.hue * 10)) % 3 !== 0) {
          targetCtx.fillRect(-w * .34 + col * w * .28, -h * .3 + row * h * .28, w * .1, h * .1);
        }
      }
    }
    targetCtx.restore();
  }

  function drawStreetlight(targetCtx, item) {
    const size = item.size;
    targetCtx.save();
    targetCtx.translate(item.x, item.y);
    targetCtx.globalAlpha = clamp(1.2 - Math.hypot(item.x - state.x, item.y - state.y) / 135, .28, .92);
    targetCtx.fillStyle = 'rgba(255, 190, 104, .11)';
    targetCtx.beginPath(); targetCtx.arc(0, 0, 2.8 * size, 0, TAU); targetCtx.fill();
    targetCtx.fillStyle = '#38464c';
    targetCtx.fillRect(-.07 * size, -.1 * size, .14 * size, 1.9 * size);
    targetCtx.strokeStyle = '#5c6c70';
    targetCtx.lineWidth = .1 * size;
    targetCtx.beginPath(); targetCtx.moveTo(0, -.05 * size); targetCtx.lineTo(.62 * size, -.46 * size); targetCtx.stroke();
    targetCtx.fillStyle = '#ffda92';
    targetCtx.shadowColor = '#ffd17e';
    targetCtx.shadowBlur = 3 * size;
    targetCtx.beginPath(); targetCtx.arc(.7 * size, -.49 * size, .14 * size, 0, TAU); targetCtx.fill();
    targetCtx.restore();
  }

  function drawBarrier(targetCtx, item) {
    const size = item.size;
    targetCtx.save();
    targetCtx.translate(item.x, item.y);
    targetCtx.rotate(item.side * .15);
    targetCtx.globalAlpha = .7;
    targetCtx.fillStyle = 'rgba(3, 7, 8, .43)';
    targetCtx.fillRect(-2.3 * size, .22 * size, 4.8 * size, .33 * size);
    for (let i = -2; i <= 2; i += 1) {
      targetCtx.fillStyle = i % 2 === 0 ? '#d0d1c1' : '#ce4f42';
      targetCtx.fillRect(i * .88 * size - .28 * size, -.06 * size, .55 * size, .35 * size);
    }
    targetCtx.restore();
  }

  function drawTree(targetCtx, item) {
    const size = item.size;
    targetCtx.save();
    targetCtx.translate(item.x, item.y);
    targetCtx.globalAlpha = clamp(1.2 - Math.hypot(item.x - state.x, item.y - state.y) / 145, .3, .95);
    targetCtx.fillStyle = 'rgba(4, 11, 9, .46)';
    targetCtx.beginPath();
    targetCtx.ellipse(0.55 * size, 0.8 * size, 1.8 * size, 0.82 * size, -0.2, 0, TAU);
    targetCtx.fill();
    targetCtx.fillStyle = '#5b4932';
    targetCtx.fillRect(-0.22 * size, -0.1 * size, 0.43 * size, 1.25 * size);
    const green = item.hue > .55 ? '#52714b' : '#3d6247';
    targetCtx.fillStyle = green;
    targetCtx.beginPath(); targetCtx.arc(-0.65 * size, -0.25 * size, 1.05 * size, 0, TAU); targetCtx.fill();
    targetCtx.fillStyle = item.hue > .45 ? '#628252' : '#4e744c';
    targetCtx.beginPath(); targetCtx.arc(0.35 * size, -0.48 * size, 1.18 * size, 0, TAU); targetCtx.fill();
    targetCtx.fillStyle = '#2d513e';
    targetCtx.beginPath(); targetCtx.arc(0, 0.24 * size, 1.12 * size, 0, TAU); targetCtx.fill();
    targetCtx.restore();
  }

  function drawBush(targetCtx, item) {
    const size = item.size;
    targetCtx.save();
    targetCtx.translate(item.x, item.y);
    targetCtx.fillStyle = 'rgba(3, 10, 8, .43)';
    targetCtx.beginPath(); targetCtx.ellipse(.4 * size, .4 * size, 1.5 * size, .65 * size, 0, 0, TAU); targetCtx.fill();
    targetCtx.fillStyle = item.hue > .5 ? '#456c49' : '#355943';
    targetCtx.beginPath(); targetCtx.arc(-.5 * size, -.12 * size, .7 * size, 0, TAU); targetCtx.fill();
    targetCtx.beginPath(); targetCtx.arc(.35 * size, -.22 * size, .86 * size, 0, TAU); targetCtx.fill();
    targetCtx.beginPath(); targetCtx.arc(.78 * size, .18 * size, .55 * size, 0, TAU); targetCtx.fill();
    targetCtx.restore();
  }

  function drawRock(targetCtx, item) {
    const size = item.size;
    targetCtx.save();
    targetCtx.translate(item.x, item.y);
    targetCtx.fillStyle = 'rgba(4, 9, 9, .5)';
    targetCtx.beginPath(); targetCtx.ellipse(.25 * size, .5 * size, 1.4 * size, .55 * size, 0, 0, TAU); targetCtx.fill();
    targetCtx.fillStyle = item.hue > .5 ? '#6d7167' : '#575f59';
    targetCtx.beginPath();
    targetCtx.moveTo(-1.0 * size, .35 * size);
    targetCtx.lineTo(-.6 * size, -.6 * size);
    targetCtx.lineTo(.35 * size, -.78 * size);
    targetCtx.lineTo(1.05 * size, .2 * size);
    targetCtx.lineTo(.55 * size, .68 * size);
    targetCtx.closePath();
    targetCtx.fill();
    targetCtx.restore();
  }

  function drawGuardrail(targetCtx, rail) {
    const p = rail.p;
    const p2 = rail.p2;
    const offset = p.width * 0.5 + 1.18;
    const a = { x: p.x + p.normal.x * rail.side * offset, y: p.y + p.normal.y * rail.side * offset };
    const b = { x: p2.x + p2.normal.x * rail.side * offset, y: p2.y + p2.normal.y * rail.side * offset };
    targetCtx.save();
    targetCtx.globalAlpha = .63;
    targetCtx.strokeStyle = 'rgba(16, 22, 22, .8)';
    targetCtx.lineWidth = .4;
    targetCtx.beginPath(); targetCtx.moveTo(a.x, a.y + .15); targetCtx.lineTo(b.x, b.y + .15); targetCtx.stroke();
    targetCtx.strokeStyle = '#aab1a5';
    targetCtx.lineWidth = .13;
    targetCtx.beginPath(); targetCtx.moveTo(a.x, a.y); targetCtx.lineTo(b.x, b.y); targetCtx.stroke();
    for (let i = 0; i <= 4; i += 1) {
      const t = i / 4;
      const x = lerp(a.x, b.x, t);
      const y = lerp(a.y, b.y, t);
      targetCtx.fillStyle = '#8e9a8e';
      targetCtx.fillRect(x - .05, y - .07, .1, .48);
    }
    targetCtx.restore();
  }

  function drawCar(targetCtx, centerX, centerY, scale) {
    const length = 88 * scale;
    const carWidth = 33 * scale;
    const tireWidth = 6.5 * scale;
    const tireLength = 15 * scale;
    targetCtx.save();
    targetCtx.translate(centerX, centerY);

    // Ground shadow.
    targetCtx.save();
    targetCtx.translate(3 * scale, 7 * scale);
    targetCtx.fillStyle = 'rgba(1, 4, 5, .56)';
    targetCtx.filter = 'blur(4px)';
    roundedRect(targetCtx, -carWidth * .57, -length * .45, carWidth * 1.14, length * .9, 9 * scale);
    targetCtx.fill();
    targetCtx.restore();

    // Tires are separate so the front pair can visibly follow the steering input.
    const tireYFront = -length * .27;
    const tireYRear = length * .27;
    targetCtx.fillStyle = '#0c1112';
    roundedRect(targetCtx, -carWidth * .61, tireYFront - tireLength / 2, tireWidth, tireLength, 2 * scale); targetCtx.fill();
    roundedRect(targetCtx, carWidth * .61 - tireWidth, tireYFront - tireLength / 2, tireWidth, tireLength, 2 * scale); targetCtx.fill();
    roundedRect(targetCtx, -carWidth * .61, tireYRear - tireLength / 2, tireWidth, tireLength, 2 * scale); targetCtx.fill();
    roundedRect(targetCtx, carWidth * .61 - tireWidth, tireYRear - tireLength / 2, tireWidth, tireLength, 2 * scale); targetCtx.fill();
    targetCtx.fillStyle = 'rgba(165, 184, 170, .25)';
    roundedRect(targetCtx, -carWidth * .58, tireYFront - tireLength * .35, tireWidth * .32, tireLength * .55, 1 * scale); targetCtx.fill();
    roundedRect(targetCtx, carWidth * .61 - tireWidth, tireYFront - tireLength * .35, tireWidth * .32, tireLength * .55, 1 * scale); targetCtx.fill();

    // Paint shell.
    const paint = targetCtx.createLinearGradient(-carWidth, -length * .5, carWidth, length * .5);
    paint.addColorStop(0, '#030507');
    paint.addColorStop(.22, '#2b3338');
    paint.addColorStop(.46, '#0e1317');
    paint.addColorStop(.72, '#070a0d');
    paint.addColorStop(1, '#010203');
    targetCtx.fillStyle = paint;
    targetCtx.strokeStyle = 'rgba(175, 196, 200, .82)';
    targetCtx.lineWidth = .7 * scale;
    targetCtx.beginPath();
    targetCtx.moveTo(0, -length * .54);
    targetCtx.quadraticCurveTo(carWidth * .4, -length * .49, carWidth * .49, -length * .27);
    targetCtx.lineTo(carWidth * .53, length * .25);
    targetCtx.quadraticCurveTo(carWidth * .4, length * .48, 0, length * .53);
    targetCtx.quadraticCurveTo(-carWidth * .4, length * .48, -carWidth * .53, length * .25);
    targetCtx.lineTo(-carWidth * .49, -length * .27);
    targetCtx.quadraticCurveTo(-carWidth * .4, -length * .49, 0, -length * .54);
    targetCtx.closePath();
    targetCtx.fill();
    targetCtx.stroke();

    // Roof and glass.
    targetCtx.fillStyle = '#182b31';
    targetCtx.strokeStyle = 'rgba(174, 229, 214, .54)';
    targetCtx.lineWidth = .55 * scale;
    targetCtx.beginPath();
    targetCtx.moveTo(0, -length * .34);
    targetCtx.quadraticCurveTo(carWidth * .35, -length * .29, carWidth * .36, -length * .05);
    targetCtx.lineTo(carWidth * .32, length * .17);
    targetCtx.quadraticCurveTo(0, length * .26, -carWidth * .32, length * .17);
    targetCtx.lineTo(-carWidth * .36, -length * .05);
    targetCtx.quadraticCurveTo(-carWidth * .35, -length * .29, 0, -length * .34);
    targetCtx.closePath();
    targetCtx.fill();
    targetCtx.stroke();
    targetCtx.fillStyle = 'rgba(153, 224, 209, .25)';
    targetCtx.beginPath();
    targetCtx.moveTo(-carWidth * .28, -length * .275);
    targetCtx.quadraticCurveTo(0, -length * .315, carWidth * .28, -length * .275);
    targetCtx.lineTo(carWidth * .22, -length * .1);
    targetCtx.lineTo(-carWidth * .22, -length * .1);
    targetCtx.closePath();
    targetCtx.fill();
    targetCtx.strokeStyle = 'rgba(8, 13, 16, .6)';
    targetCtx.lineWidth = .45 * scale;
    targetCtx.beginPath(); targetCtx.moveTo(-carWidth * .31, -length * .055); targetCtx.lineTo(carWidth * .31, -length * .055); targetCtx.stroke();

    // Hood highlight and rear lip.
    targetCtx.strokeStyle = 'rgba(120, 184, 209, .48)';
    targetCtx.lineWidth = .55 * scale;
    targetCtx.beginPath(); targetCtx.moveTo(-carWidth * .34, -length * .39); targetCtx.quadraticCurveTo(0, -length * .45, carWidth * .34, -length * .39); targetCtx.stroke();
    targetCtx.fillStyle = '#391b21';
    targetCtx.fillRect(-carWidth * .43, length * .39, carWidth * .86, 1.9 * scale);

    // Headlights and brake lamps.
    targetCtx.fillStyle = '#fff5cc';
    targetCtx.shadowColor = '#fff1bf';
    targetCtx.shadowBlur = 5 * scale;
    roundedRect(targetCtx, -carWidth * .34, -length * .465, carWidth * .19, 2.8 * scale, 1 * scale); targetCtx.fill();
    roundedRect(targetCtx, carWidth * .15, -length * .465, carWidth * .19, 2.8 * scale, 1 * scale); targetCtx.fill();
    targetCtx.shadowBlur = 0;
    targetCtx.fillStyle = controls.brake ? '#ff5b48' : '#a52e31';
    roundedRect(targetCtx, -carWidth * .36, length * .42, carWidth * .2, 2.3 * scale, .8 * scale); targetCtx.fill();
    roundedRect(targetCtx, carWidth * .16, length * .42, carWidth * .2, 2.3 * scale, .8 * scale); targetCtx.fill();

    // Small active steering marker.
    targetCtx.strokeStyle = 'rgba(199,239,129,.86)';
    targetCtx.lineWidth = 1.1 * scale;
    targetCtx.beginPath(); targetCtx.moveTo(-carWidth * .21, -length * .515); targetCtx.lineTo(carWidth * .21, -length * .515); targetCtx.stroke();
    targetCtx.restore();
  }

  function roundedRect(targetCtx, x, y, w, h, radius) {
    const r = Math.min(radius, Math.abs(w) / 2, Math.abs(h) / 2);
    targetCtx.beginPath();
    targetCtx.moveTo(x + r, y);
    targetCtx.arcTo(x + w, y, x + w, y + h, r);
    targetCtx.arcTo(x + w, y + h, x, y + h, r);
    targetCtx.arcTo(x, y + h, x, y, r);
    targetCtx.arcTo(x, y, x + w, y, r);
    targetCtx.closePath();
  }

  function getCameraConfig() {
    return {
      chase: { worldY: .56, carY: .56, zoom: 1, showCar: true, lookAhead: 0 },
      hood: { worldY: .47, carY: .72, zoom: 1.08, showCar: true, lookAhead: 3.4 },
      bumper: { worldY: .42, carY: .79, zoom: 1.2, showCar: false, lookAhead: 5.2 },
      cockpit: { worldY: .45, carY: .76, zoom: 1.03, showCar: false, lookAhead: 2.4 }
    }[cameraMode];
  }

  function drawCityBackdrop(targetCtx) {
    const horizon = height * .31;
    targetCtx.save();
    const sky = targetCtx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, 'rgba(7, 13, 21, .08)');
    sky.addColorStop(.62, 'rgba(26, 46, 61, .15)');
    sky.addColorStop(1, 'rgba(8, 14, 20, .46)');
    targetCtx.fillStyle = sky;
    targetCtx.fillRect(0, 0, width, horizon);

    targetCtx.globalCompositeOperation = 'screen';
    const sun = targetCtx.createRadialGradient(width * .68, horizon * .42, 2, width * .68, horizon * .42, Math.min(width, height) * .2);
    sun.addColorStop(0, 'rgba(255, 206, 145, .23)');
    sun.addColorStop(1, 'rgba(255, 155, 93, 0)');
    targetCtx.fillStyle = sun;
    targetCtx.fillRect(0, 0, width, horizon);
    targetCtx.globalCompositeOperation = 'source-over';

    for (let i = -1; i < 22; i += 1) {
      const towerWidth = 30 + ((i * 17 + 33) % 42);
      const towerHeight = 38 + ((i * 37 + 21) % 104);
      const x = i * 76 - 28;
      const y = horizon - towerHeight;
      targetCtx.fillStyle = i % 4 === 0 ? 'rgba(8, 17, 25, .74)' : 'rgba(9, 20, 28, .61)';
      targetCtx.fillRect(x, y, towerWidth, towerHeight + 15);
      if (i % 3 === 0) {
        targetCtx.fillStyle = 'rgba(106, 159, 190, .18)';
        targetCtx.fillRect(x + towerWidth * .47, y - 12, 1.2, 12);
      }
      targetCtx.fillStyle = i % 2 ? 'rgba(224, 173, 103, .19)' : 'rgba(116, 190, 226, .18)';
      for (let row = y + 12; row < horizon - 5; row += 11) {
        if ((row + i * 7) % 23 < 14) targetCtx.fillRect(x + 7, row, 3, 2);
        if ((row + i * 5) % 29 < 18) targetCtx.fillRect(x + towerWidth - 10, row + 3, 3, 2);
      }
    }
    targetCtx.fillStyle = 'rgba(10, 17, 22, .46)';
    targetCtx.fillRect(0, horizon - 2, width, 20);
    targetCtx.restore();
  }

  function render(nowSeconds) {
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const background = ctx.createLinearGradient(0, 0, 0, height);
    background.addColorStop(0, '#152637');
    background.addColorStop(.46, '#17262f');
    background.addColorStop(1, '#070d13');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    const camera = getCameraConfig();
    const cameraY = height * camera.worldY;
    const carY = height * camera.carY;
    const scale = clamp(Math.min(width / 310, height / 188) * camera.zoom, 3.35, 6.0);
    ctx.save();
    ctx.translate(width * .5, cameraY);
    ctx.rotate(-state.heading - Math.PI / 2);
    ctx.scale(scale, scale);
    ctx.translate(-state.x, -state.y);
    drawGround(ctx);
    drawScenery(ctx);
    drawTrack(ctx);
    drawOpponents(ctx);
    ctx.restore();
    drawCityBackdrop(ctx);

    // A low sunset bloom behind the fixed car gives the scene depth without hiding telemetry.
    const bloom = ctx.createRadialGradient(width * .5, cameraY - 25, 10, width * .5, cameraY - 25, Math.min(width, height) * .58);
    bloom.addColorStop(0, 'rgba(236, 146, 96, .13)');
    bloom.addColorStop(.37, 'rgba(76, 125, 170, .05)');
    bloom.addColorStop(1, 'rgba(2, 7, 12, .19)');
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, width, height);

    if (Math.abs(localVelocity().forwardSpeed) > 19) {
      const intensity = clamp((Math.abs(localVelocity().forwardSpeed) - 19) / 26, 0, 1);
      ctx.save();
      ctx.globalAlpha = intensity * .15;
      ctx.strokeStyle = '#d2e2bc';
      ctx.lineWidth = 1;
      const cx = width * .5;
      const cy = carY;
      for (let i = 0; i < 13; i += 1) {
        const side = i % 2 === 0 ? -1 : 1;
        const y = cy - 80 + i * 17;
        ctx.beginPath();
        ctx.moveTo(cx + side * (55 + i * 15), y);
        ctx.lineTo(cx + side * (75 + i * 18), y);
        ctx.stroke();
      }
      ctx.restore();
    }

    const carScale = clamp(Math.min(width, height) / 770 * camera.zoom, .72, 1.22);
    if (camera.showCar) {
      if (state.nitroActive) drawNitroFlames(ctx, width * .5, carY, carScale);
      drawCar(ctx, width * .5, carY, carScale);
    }
    drawCameraOverlay(ctx, cameraMode, carY);
    drawMap();
  }

  function drawNitroFlames(targetCtx, centerX, centerY, scale) {
    const length = 88 * scale;
    const gradient = targetCtx.createLinearGradient(centerX, centerY + length * .38, centerX, centerY + length * .86);
    gradient.addColorStop(0, 'rgba(129, 222, 255, .95)');
    gradient.addColorStop(.45, 'rgba(36, 132, 255, .78)');
    gradient.addColorStop(1, 'rgba(29, 72, 255, 0)');
    targetCtx.save();
    targetCtx.globalCompositeOperation = 'screen';
    targetCtx.fillStyle = gradient;
    targetCtx.beginPath();
    targetCtx.moveTo(centerX - 8 * scale, centerY + length * .39);
    targetCtx.lineTo(centerX, centerY + length * (.72 + Math.sin(performance.now() * .04) * .04));
    targetCtx.lineTo(centerX + 8 * scale, centerY + length * .39);
    targetCtx.closePath();
    targetCtx.fill();
    targetCtx.restore();
  }

  function drawCameraOverlay(targetCtx, mode, carY) {
    if (mode === 'cockpit') {
      targetCtx.save();
      targetCtx.fillStyle = 'rgba(3, 8, 12, .38)';
      targetCtx.fillRect(0, 0, width, height * .18);
      targetCtx.strokeStyle = 'rgba(18, 26, 30, .88)';
      targetCtx.lineWidth = Math.max(7, width * .008);
      targetCtx.beginPath(); targetCtx.moveTo(width * .18, 0); targetCtx.lineTo(width * .38, height * .48); targetCtx.moveTo(width * .82, 0); targetCtx.lineTo(width * .62, height * .48); targetCtx.stroke();
      targetCtx.fillStyle = 'rgba(4, 7, 9, .88)';
      targetCtx.beginPath(); targetCtx.moveTo(0, height); targetCtx.lineTo(0, height * .86); targetCtx.quadraticCurveTo(width * .5, height * .72, width, height * .86); targetCtx.lineTo(width, height); targetCtx.closePath(); targetCtx.fill();
      targetCtx.strokeStyle = 'rgba(105, 181, 255, .5)';
      targetCtx.lineWidth = 2;
      targetCtx.beginPath(); targetCtx.arc(width * .5, height * .93, Math.min(width, height) * .11, Math.PI * 1.13, Math.PI * 1.87); targetCtx.stroke();
      targetCtx.restore();
    } else if (mode === 'bumper') {
      targetCtx.save();
      targetCtx.fillStyle = 'rgba(3, 8, 12, .42)';
      targetCtx.fillRect(0, 0, width, 37);
      targetCtx.fillStyle = 'rgba(0, 3, 5, .78)';
      targetCtx.fillRect(0, height - 24, width, 24);
      targetCtx.restore();
    } else if (mode === 'hood') {
      targetCtx.save();
      const hoodGradient = targetCtx.createLinearGradient(0, carY + 55, 0, height);
      hoodGradient.addColorStop(0, 'rgba(4, 7, 9, .04)');
      hoodGradient.addColorStop(1, 'rgba(1, 3, 4, .76)');
      targetCtx.fillStyle = hoodGradient;
      targetCtx.beginPath();
      targetCtx.moveTo(width * .28, height);
      targetCtx.quadraticCurveTo(width * .38, carY + 42, width * .5, carY + 32);
      targetCtx.quadraticCurveTo(width * .62, carY + 42, width * .72, height);
      targetCtx.closePath();
      targetCtx.fill();
      targetCtx.restore();
    }
  }

  function drawMap() {
    mapCtx.setTransform(mapRatio, 0, 0, mapRatio, 0, 0);
    mapCtx.clearRect(0, 0, mapWidth, mapHeight);
    if (!track.length) return;

    const pad = 20;
    const bounds = track.reduce((acc, point) => ({
      minX: Math.min(acc.minX, point.x), maxX: Math.max(acc.maxX, point.x),
      minY: Math.min(acc.minY, point.y), maxY: Math.max(acc.maxY, point.y)
    }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
    const mapScale = Math.min((mapWidth - pad * 2) / (bounds.maxX - bounds.minX), (mapHeight - pad * 2) / (bounds.maxY - bounds.minY));
    const mapX = (x) => pad + (x - bounds.minX) * mapScale + (mapWidth - pad * 2 - (bounds.maxX - bounds.minX) * mapScale) / 2;
    const mapY = (y) => pad + (y - bounds.minY) * mapScale + (mapHeight - pad * 2 - (bounds.maxY - bounds.minY) * mapScale) / 2;

    mapCtx.save();
    mapCtx.lineCap = 'round';
    mapCtx.lineJoin = 'round';
    mapCtx.beginPath();
    mapCtx.moveTo(mapX(track[0].x), mapY(track[0].y));
    for (let i = 1; i < track.length; i += 1) mapCtx.lineTo(mapX(track[i].x), mapY(track[i].y));
    mapCtx.closePath();
    mapCtx.strokeStyle = 'rgba(39, 127, 225, .18)';
    mapCtx.lineWidth = 8;
    mapCtx.stroke();
    mapCtx.strokeStyle = 'rgba(190, 205, 195, .62)';
    mapCtx.lineWidth = 2.2;
    mapCtx.stroke();
    mapCtx.strokeStyle = 'rgba(105, 181, 255, .82)';
    mapCtx.lineWidth = 1;
    mapCtx.setLineDash([3, 4]);
    mapCtx.stroke();
    mapCtx.setLineDash([]);

    const start = track[0];
    mapCtx.fillStyle = '#dce9d5';
    mapCtx.fillRect(mapX(start.x) - 2, mapY(start.y) - 2, 4, 4);

    for (const opponent of opponents) {
      const opponentIndex = Math.floor(opponent.s / trackLength * track.length) % track.length;
      const opponentPoint = track[opponentIndex];
      mapCtx.fillStyle = 'rgba(204, 220, 225, .72)';
      mapCtx.beginPath(); mapCtx.arc(mapX(opponentPoint.x), mapY(opponentPoint.y), 1.6, 0, TAU); mapCtx.fill();
    }

    const playerX = mapX(state.x);
    const playerY = mapY(state.y);
    mapCtx.fillStyle = 'rgba(255, 132, 95, .2)';
    mapCtx.beginPath(); mapCtx.arc(playerX, playerY, 8, 0, TAU); mapCtx.fill();
    mapCtx.fillStyle = '#ff845f';
    mapCtx.beginPath(); mapCtx.arc(playerX, playerY, 3.2, 0, TAU); mapCtx.fill();
    mapCtx.strokeStyle = '#ffb09a';
    mapCtx.lineWidth = 1;
    mapCtx.beginPath(); mapCtx.moveTo(playerX, playerY); mapCtx.lineTo(playerX + Math.cos(state.heading) * 8, playerY + Math.sin(state.heading) * 8); mapCtx.stroke();
    mapCtx.restore();
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return '— — : — —';
    const minutes = Math.floor(seconds / 60);
    const remainder = (seconds % 60).toFixed(3).padStart(6, '0');
    return `${String(minutes).padStart(2, '0')}:${remainder}`;
  }

  function updateHUD(now) {
    const velocity = localVelocity();
    const forwardSpeed = velocity.forwardSpeed;
    const absoluteSpeed = Math.abs(forwardSpeed);
    const speedKmh = Math.round(absoluteSpeed * 3.6);
    ui.speedValue.textContent = String(speedKmh).padStart(3, '0');

    let gear = 'N';
    let numericGear = 0;
    if (!started) gear = 'P';
    else if (forwardSpeed < -0.5) gear = 'R';
    else if (absoluteSpeed < 1.2 && !controls.throttle) gear = 'N';
    else {
      numericGear = clamp(Math.floor(absoluteSpeed / 8.8) + 1, 1, 6);
      gear = String(numericGear);
    }
    ui.gearValue.textContent = gear;
    ui.gearStack.forEach((item, index) => item.classList.toggle('active', index + 1 === numericGear));

    const rpm = !started ? .9 : clamp(.95 + absoluteSpeed * .105 + (controls.throttle ? 1.25 : 0) + Math.abs(state.steer) * .22, .9, 8.9);
    ui.rpmValue.textContent = `${rpm.toFixed(1)}k RPM`;
    ui.rpmFill.style.width = `${clamp(rpm / 9.2 * 100, 3, 100)}%`;
    ui.nitroValue.textContent = `${Math.round(state.nitro)}%`;
    ui.nitroFill.style.width = `${clamp(state.nitro, 0, 100)}%`;
    ui.nitroFill.parentElement.parentElement.classList.toggle('is-active', state.nitroActive);
    ui.lapValue.textContent = `${String(state.lap).padStart(2, '0')} / 03`;
    ui.lapTime.textContent = started ? formatTime(state.lapTime) : '00:00.000';
    ui.bestTime.textContent = state.bestLap ? formatTime(state.bestLap) : '— — : — —';
    ui.distanceValue.innerHTML = `${(state.distance / 1000).toFixed(2)} <em>KM</em>`;
    ui.tractionValue.textContent = `${Math.round(state.traction)}%`;
    ui.tireValue.textContent = `${Math.round(state.tireTemp)}°`;
    ui.gForceValue.textContent = `${state.gForce.toFixed(2)} G`;

    const progress = clamp(state.s / trackLength, 0, 1);
    ui.positionValue.innerHTML = `${state.position}<span>/8</span>`;
    ui.raceLapValue.innerHTML = `LAP ${state.lap}<span>/3</span>`;

    const offRoad = state.projection && Math.abs(state.projection.lateral) > state.projection.width * .5;
    if (!started) {
      ui.sessionStatus.textContent = 'STANDBY';
      ui.driveState.textContent = 'PARKED';
      ui.surfaceState.textContent = 'READY FOR SESSION';
      ui.raceStatusText.textContent = 'GRID POSITION LOCKED';
    } else if (state.finished) {
      ui.sessionStatus.textContent = 'FINISH';
      ui.driveState.textContent = 'FINISHED';
      ui.surfaceState.textContent = 'CHECKERED FLAG';
      ui.raceStatusText.textContent = 'FINISH LINE CROSSED';
    } else if (paused) {
      ui.sessionStatus.textContent = 'PAUSED';
      ui.driveState.textContent = 'PAUSED';
      ui.surfaceState.textContent = 'SESSION HOLD';
      ui.raceStatusText.textContent = 'RACE TIMER ON HOLD';
    } else {
      ui.sessionStatus.textContent = 'LIVE';
      ui.driveState.textContent = offRoad ? 'OFF TRACK' : (absoluteSpeed > 1 ? 'DRIVING' : 'IDLE');
      ui.surfaceState.textContent = offRoad ? 'LOW GRIP / GRASS' : 'GRIP / DRY ASPHALT';
      ui.raceStatusText.textContent = offRoad ? 'FIND THE ROAD' : (state.nitroActive ? 'NITRO ENGAGED' : 'RACE IN PROGRESS');
    }

    const upcoming = getUpcomingCorner(progress);
    ui.cornerName.textContent = upcoming.corner.name;
    ui.cornerNote.textContent = upcoming.corner.note;
    ui.cornerDistance.textContent = upcoming.distance < 8 ? 'NOW' : `${Math.round(upcoming.distance)} M`;
    ui.cornerBar.style.width = `${clamp(100 - upcoming.distance / Math.max(trackLength * .25, 1) * 100, 10, 100)}%`;

    const latitude = 46.133 + (state.y + 78) * .00011;
    const longitude = 7.234 + (state.x + 78) * .00014;
    ui.mapCoordinate.textContent = `${Math.abs(latitude).toFixed(3)}° N / ${Math.abs(longitude).toFixed(3)}° E`;

    const nowDate = new Date();
    ui.sessionClock.textContent = [nowDate.getHours(), nowDate.getMinutes(), nowDate.getSeconds()].map((part) => String(part).padStart(2, '0')).join(':');

    if (now - lastHudUpdate > 90) lastHudUpdate = now;
  }

  function getUpcomingCorner(progress) {
    let selected = corners[0];
    let distanceFraction = 1;
    for (const corner of corners) {
      const diff = wrap(corner.at - progress, 1);
      if (diff < distanceFraction) {
        selected = corner;
        distanceFraction = diff;
      }
    }
    return { corner: selected, distance: distanceFraction * trackLength };
  }

  function showToastMessage(message) {
    ui.toastText.textContent = message;
    ui.toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('visible'), 2600);
  }

  function setCamera(nextMode, announce = true) {
    if (!cameraModes.includes(nextMode)) return;
    cameraMode = nextMode;
    document.querySelectorAll('[data-camera]').forEach((button) => button.classList.toggle('active', button.dataset.camera === cameraMode));
    if (announce) showToastMessage(`CAMERA · ${cameraMode.toUpperCase()}`);
  }

  function cycleCamera() {
    const nextIndex = (cameraModes.indexOf(cameraMode) + 1) % cameraModes.length;
    setCamera(cameraModes[nextIndex]);
  }

  function openGuide() {
    if (!started) return;
    togglePause(true);
    ui.startButton.querySelector('span:nth-child(2)').textContent = 'RESUME DRIVE';
    ui.startOverlay.classList.remove('hidden');
  }

  function startSession() {
    if (started) {
      ui.startOverlay.classList.add('hidden');
      ui.startButton.querySelector('span:nth-child(2)').textContent = 'START ENGINE';
      togglePause(false);
      return;
    }
    started = true;
    paused = false;
    state.lapStartedAt = performance.now();
    ui.startOverlay.classList.add('hidden');
    ui.pauseOverlay.classList.remove('visible');
    ui.pauseOverlay.setAttribute('aria-hidden', 'true');
    ui.pauseButton.classList.remove('is-paused');
    initAudio();
    showToastMessage('ENGINE LIVE · FIND YOUR LINE');
  }

  function togglePause(force) {
    if (!started) return;
    const next = typeof force === 'boolean' ? force : !paused;
    if (next === paused) return;
    paused = next;
    if (paused) state.nitroActive = false;
    ui.pauseOverlay.classList.toggle('visible', paused);
    ui.pauseOverlay.setAttribute('aria-hidden', String(!paused));
    ui.pauseButton.classList.toggle('is-paused', paused);
    ui.pauseButton.setAttribute('aria-label', paused ? 'Resume simulation' : 'Pause simulation');
    ui.pauseButton.title = paused ? 'Resume simulation' : 'Pause simulation';
    if (!paused) {
      lastFrame = performance.now();
      showToastMessage('SESSION LIVE · GOOD LUCK');
    }
    if (audio && audio.context) audio.context.resume();
  }

  function initAudio() {
    if (audio) {
      if (audio.context.state === 'suspended') audio.context.resume();
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    try {
      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const subOscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const subGain = audioContext.createGain();
      oscillator.type = 'sawtooth';
      subOscillator.type = 'triangle';
      oscillator.frequency.value = 72;
      subOscillator.frequency.value = 36;
      gain.gain.value = 0.0001;
      subGain.gain.value = 0.0001;
      oscillator.connect(gain).connect(audioContext.destination);
      subOscillator.connect(subGain).connect(audioContext.destination);
      oscillator.start();
      subOscillator.start();
      audio = { context: audioContext, oscillator, subOscillator, gain, subGain };
    } catch (error) {
      audio = null;
    }
  }

  function updateAudio(speed, yawRate) {
    if (!audio) return;
    const rpm = clamp(.95 + Math.abs(speed) * .105 + (controls.throttle ? 1.25 : 0), .9, 8.9);
    const time = audio.context.currentTime;
    audio.oscillator.frequency.setTargetAtTime(52 + rpm * 22, time, .035);
    audio.subOscillator.frequency.setTargetAtTime(26 + rpm * 10.5, time, .05);
    const volume = muted || paused || !started ? 0.0001 : .009 + (controls.throttle ? .012 : 0) + Math.min(.008, Math.abs(yawRate) * .006);
    audio.gain.gain.setTargetAtTime(volume, time, .06);
    audio.subGain.gain.setTargetAtTime(volume * .38, time, .08);
  }

  function toggleMute() {
    muted = !muted;
    ui.soundButton.classList.toggle('is-muted', muted);
    ui.soundButton.setAttribute('aria-label', muted ? 'Unmute engine audio' : 'Mute engine audio');
    ui.soundButton.title = muted ? 'Unmute engine audio' : 'Mute engine audio';
    if (!muted) initAudio();
    showToastMessage(muted ? 'ENGINE AUDIO MUTED' : 'ENGINE AUDIO ON');
  }

  function setControl(name, value) {
    if (name in controls) controls[name] = value;
  }

  function handleKey(event, value) {
    const code = event.code;
    const mapping = {
      KeyW: 'throttle', ArrowUp: 'throttle',
      KeyS: 'brake', ArrowDown: 'brake',
      KeyA: 'left', ArrowLeft: 'left',
      KeyD: 'right', ArrowRight: 'right',
      Space: 'handbrake', ShiftLeft: 'nitro', ShiftRight: 'nitro'
    };
    const control = mapping[code];
    if (control) {
      event.preventDefault();
      setControl(control, value);
    }
    if (value && !event.repeat) {
      if (code === 'Enter' && (!started || !ui.startOverlay.classList.contains('hidden'))) startSession();
      if (code === 'KeyP' || code === 'Escape') togglePause();
      if (code === 'KeyR') resetCar(true);
      if (code === 'KeyM') toggleMute();
      if (code === 'KeyC') cycleCamera();
    }
  }

  function setupInput() {
    window.addEventListener('keydown', (event) => handleKey(event, true), { passive: false });
    window.addEventListener('keyup', (event) => handleKey(event, false), { passive: false });
    window.addEventListener('blur', () => Object.keys(controls).forEach((key) => { controls[key] = false; }));

    document.querySelectorAll('[data-control]').forEach((button) => {
      const control = button.dataset.control;
      const press = (event) => {
        event.preventDefault();
        setControl(control, true);
        button.classList.add('pressed');
        if (button.setPointerCapture) button.setPointerCapture(event.pointerId);
      };
      const release = (event) => {
        event.preventDefault();
        setControl(control, false);
        button.classList.remove('pressed');
      };
      button.addEventListener('pointerdown', press, { passive: false });
      button.addEventListener('pointerup', release, { passive: false });
      button.addEventListener('pointercancel', release, { passive: false });
      button.addEventListener('lostpointercapture', release, { passive: false });
    });
  }

  function animate(now) {
    const dt = Math.min(.05, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    if (started && !paused && !state.finished) updatePhysics(dt, now);
    render(now / 1000);
    updateHUD(now);
    requestAnimationFrame(animate);
  }

  ui.startButton.addEventListener('click', startSession);
  ui.guideButton.addEventListener('click', openGuide);
  document.querySelectorAll('[data-camera]').forEach((button) => {
    button.addEventListener('click', () => setCamera(button.dataset.camera));
  });
  ui.pauseButton.addEventListener('click', () => togglePause());
  ui.resumeButton.addEventListener('click', () => togglePause(false));
  ui.resetButton.addEventListener('click', () => resetCar(true));
  ui.soundButton.addEventListener('click', toggleMute);
  window.addEventListener('resize', resizeCanvases);

  buildTrack();
  resizeCanvases();
  resetCar(false);
  setupInput();
  updateHUD(performance.now());
  requestAnimationFrame(animate);
})();
