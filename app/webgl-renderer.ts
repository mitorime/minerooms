import type { World } from "./game-core";

export type WebGLFrame = {
  world: World;
  playerX: number;
  playerY: number;
  angle: number;
  pitch: number;
  cameraHeight: number;
  ceilingHeight: number;
  fov: number;
  maxDistance: number;
  now: number;
  flicker: boolean;
  exit: { x: number; y: number } | null;
  hover: { x: number; y: number } | null;
  wallMarks: Set<string>;
  revealedPits: Set<number>;
  pitHints: number[];
  lamps: { active: boolean }[];
  lampLight: Float32Array;
  bobY: number;
};

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * .5 + .5;
  gl_Position = vec4(a_position, 0., 1.);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;

in vec2 v_uv;
out vec4 outColor;
uniform vec2 u_resolution;
uniform vec2 u_player;
uniform float u_angle;
uniform float u_pitch;
uniform float u_height;
uniform float u_ceiling;
uniform float u_fov;
uniform float u_maxDistance;
uniform float u_time;
uniform float u_flicker;
uniform float u_size;
uniform float u_seed;
uniform float u_bobY;
uniform vec2 u_exit;
uniform vec2 u_hover;
uniform sampler2D u_map;
uniform sampler2D u_lamps;
uniform sampler2D u_marks;

const float PI = 3.141592653589793;

ivec2 wrapped(ivec2 p) {
  int size = int(u_size);
  return ivec2((p.x % size + size) % size, (p.y % size + size) % size);
}

vec4 mapAt(ivec2 p) { return texelFetch(u_map, wrapped(p), 0); }
vec4 marksAt(ivec2 p) { return texelFetch(u_marks, wrapped(p), 0); }
float lampAt(ivec2 p) { return texelFetch(u_lamps, wrapped(p), 0).r; }
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + u_seed * .00013) * 43758.5453123); }

float visibility(float distanceValue) {
  float ratio = clamp(distanceValue / u_maxDistance, 0., 1.);
  float shaped = pow(ratio, .68);
  float fade = shaped * shaped * (3. - 2. * shaped);
  float base = 1. - .88 * fade;
  float nearRatio = clamp(distanceValue / 5., 0., 1.);
  float nearFade = 1. - nearRatio * nearRatio * (3. - 2. * nearRatio);
  return min(1., base + nearFade * .18);
}

float localLamp(vec2 worldPosition) {
  vec2 samplePosition = worldPosition - .5;
  ivec2 cell = ivec2(floor(samplePosition));
  vec2 raw = fract(samplePosition);
  vec2 blend = raw * raw * (3. - 2. * raw);
  float top = mix(mapAt(cell).a, mapAt(cell + ivec2(1, 0)).a, blend.x);
  float bottom = mix(mapAt(cell + ivec2(0, 1)).a, mapAt(cell + ivec2(1, 1)).a, blend.x);
  return mix(top, bottom, blend.y);
}

struct Hit { float distanceValue; float code; float vertical; float textureU; float face; vec2 cell; };

Hit castRay(vec2 ray) {
  ivec2 mapCell = ivec2(floor(u_player));
  vec2 delta = vec2(ray.x == 0. ? 1e30 : abs(1. / ray.x), ray.y == 0. ? 1e30 : abs(1. / ray.y));
  ivec2 stepCell = ivec2(ray.x < 0. ? -1 : 1, ray.y < 0. ? -1 : 1);
  vec2 side = vec2(
    ray.x < 0. ? (u_player.x - float(mapCell.x)) * delta.x : (float(mapCell.x + 1) - u_player.x) * delta.x,
    ray.y < 0. ? (u_player.y - float(mapCell.y)) * delta.y : (float(mapCell.y + 1) - u_player.y) * delta.y
  );
  float distanceValue = u_maxDistance;
  float vertical = 0.;
  for (int i = 0; i < 96; i++) {
    if (side.x < side.y) { distanceValue = side.x; side.x += delta.x; mapCell.x += stepCell.x; vertical = 1.; }
    else { distanceValue = side.y; side.y += delta.y; mapCell.y += stepCell.y; vertical = 0.; }
    if (distanceValue > u_maxDistance) break;
    vec4 data = mapAt(mapCell);
    float code = floor(data.r * 5. + .5);
    bool revealedPit = code == 2. && data.g > .5;
    if (code > .5 && !revealedPit) {
      vec2 hitPosition = u_player + ray * distanceValue;
      float textureU = vertical > .5 ? fract(hitPosition.y) : fract(hitPosition.x);
      float face;
      if (vertical > .5) { face = ray.x > 0. ? 3. : 2.; if (ray.x > 0.) textureU = 1. - textureU; }
      else { face = ray.y > 0. ? 0. : 1.; if (ray.y < 0.) textureU = 1. - textureU; }
      return Hit(distanceValue, code, vertical, textureU, face, vec2(wrapped(mapCell)));
    }
  }
  return Hit(u_maxDistance, 0., 0., 0., 0., vec2(0.));
}

float markChannel(vec4 marks, float face) {
  if (face < .5) return marks.r;
  if (face < 1.5) return marks.g;
  if (face < 2.5) return marks.b;
  return marks.a;
}

float stainMask(vec2 cell, vec2 local, int stain) {
  float indexValue = float(stain);
  vec2 randomPair = vec2(hash21(cell * 7.13 + vec2(indexValue * 47.73, 11.)), hash21(cell * 9.31 + vec2(29., indexValue * 63.17)));
  vec2 center = .12 + randomPair * .76;
  float selector = hash21(cell + vec2(indexValue * 19.7, 71.));
  vec2 radius = selector < .25 ? vec2(.085,.055) : selector < .5 ? vec2(.132,.084) : selector < .75 ? vec2(.181,.111) : vec2(.257,.076);
  float angle = hash21(cell * 3.7 + indexValue) * PI;
  mat2 rotation = mat2(cos(angle), sin(angle), -sin(angle), cos(angle));
  vec2 q = rotation * (local - center) / radius;
  q += vec2(q.y*q.y, q.x*q.x) * (hash21(cell + indexValue * 5.3) - .5) * .09;
  float shape = dot(q,q) + q.x*q.y*.13;
  return clamp((1. - shape) * 1.35, 0., 1.);
}

void main() {
  float screenX = v_uv.x * 2. - 1.;
  float planeX = screenX * tan(u_fov * .5);
  vec2 forward = vec2(cos(u_angle), sin(u_angle));
  vec2 right = vec2(-forward.y, forward.x);
  vec2 rayUnnormalized = forward + right * planeX;
  float rayScale = length(rayUnnormalized);
  vec2 ray = rayUnnormalized / rayScale;
  float relative = atan(planeX);
  float projection = u_resolution.x / (2. * tan(u_fov * .5));
  float screenY = (1. - v_uv.y) * u_resolution.y;
  float horizon = u_resolution.y * .5 - tan(u_pitch) * projection + u_bobY;
  Hit hit = castRay(ray);
  float corrected = hit.distanceValue * cos(relative);
  float wallTop = horizon - (u_ceiling - u_height) * projection / max(.025, corrected);
  float wallBottom = horizon + u_height * projection / max(.025, corrected);
  vec3 color;
  float distanceValue;

  if (hit.code > .5 && screenY >= wallTop && screenY <= wallBottom) {
    distanceValue = corrected;
    float sideLight = hit.vertical > .5 ? 1. : .84;
    float fog = min(1.12, visibility(corrected) + localLamp(u_player + ray * hit.distanceValue) * .3) * u_flicker * sideLight;
    float blur = clamp((corrected - 9.) / max(1., u_maxDistance - 9.), 0., 1.);
    float steps = max(5., floor(80. * (1. - blur) + .5));
    float textureU = floor(hit.textureU * steps + .5) / steps;
    float wallSeed = hit.cell.x * 19.17 + hit.cell.y * 31.73;
    float wallpaper = (sin(textureU * 38. + wallSeed) * 4. + sin(textureU * 113. + wallSeed * .7) * 2.) * (1. - blur * .75);
    float pillarMottle = (sin(textureU * 29. + wallSeed) * 3. + sin(textureU * 67. + wallSeed * .6) * 1.5) * (1. - blur * .7);
    bool pillar = hit.code > 3.5 && hit.code < 4.5;
    color = pillar ? vec3(174. + pillarMottle, 160. + pillarMottle, 91. + pillarMottle*.55) : vec3(184. + wallpaper, 172. + wallpaper, 78. + wallpaper*.5);
    float wallV = (screenY - wallTop) / max(1., wallBottom - wallTop);
    if (pillar && (wallV < .11 || wallV > .89)) color = vec3(207.,199.,151.);
    if (!pillar && markChannel(marksAt(ivec2(hit.cell)), hit.face) > .5) {
      float u = hit.textureU;
      float flag = 0.;
      if (abs(u-.37) < .035 && wallV > .24 && wallV < .81) flag = 1.;
      if (u >= .37 && u <= .77) { float halfWidth = .13 * (1. - (u-.37)/.4); if (abs(wallV-.405) < halfWidth) flag = 1.; }
      if (u >= .25 && u <= .5 && abs(wallV - (.82-abs(u-.375)*.42)) < .018) flag = 1.;
      color = mix(color, vec3(18.,15.,9.), flag*.86);
    }
    if (distance(hit.cell, u_hover) < .1) {
      float phase = fract(u_time);
      float hoverAlpha = .055 + (.5-cos(phase*PI*2.)*.5)*.2;
      color = mix(color, vec3(255.,255.,245.), hoverAlpha);
    }
    color *= fog / 255.;
  } else {
    bool ceiling = screenY < horizon;
    float planeHeight = ceiling ? u_ceiling-u_height : u_height;
    distanceValue = planeHeight * projection / max(1., abs(screenY-horizon));
    vec2 worldPosition = u_player + rayUnnormalized * distanceValue;
    ivec2 cell = ivec2(floor(worldPosition));
    vec2 local = fract(worldPosition);
    float lampRangeRatio = clamp((distanceValue-(u_maxDistance-4.))/4.,0.,1.);
    float lampRange = 1.-lampRangeRatio*lampRangeRatio*(3.-2.*lampRangeRatio);
    float emissive = 0.;
    if (ceiling) {
      float lampActive = lampAt(cell);
      vec2 offset = vec2(sin(float(cell.x)*17.3+float(cell.y)*9.1), sin(float(cell.x)*7.7-float(cell.y)*19.9))*.13;
      vec2 lampLocal = local-(.5+offset);
      float edge = max(abs(lampLocal.x)/.34,abs(lampLocal.y)/.23);
      emissive = lampActive>.5 ? clamp((1.14-edge)/.28,0.,1.)*lampRange : 0.;
      float mottle = sin(worldPosition.x*21.)*sin(worldPosition.y*17.)*4.;
      color = mix(vec3(153.+mottle,145.+mottle,78.+mottle*.6),vec3(248.,242.,188.),emissive);
      if (distance(vec2(wrapped(cell)),u_exit)<.1) {
        vec2 hole = local-.5;
        float edgeHole=max(abs(hole.x)/.39,abs(hole.y)/.35);
        if(edgeHole<1.) { float rim=clamp((1.-edgeHole)*8.,0.,1.); color=vec3(42.,39.,22.)-vec3(25.,24.,13.)*rim; emissive=0.; }
      }
    } else {
      vec4 data=mapAt(cell);
      bool floorHole=data.r>.3 && data.r<.5 && data.g>.5;
      if(floorHole) color=vec3(0.);
      else {
        float distantBlur=clamp((distanceValue-9.)/max(1.,u_maxDistance-9.),0.,1.);
        float weave=(sin(worldPosition.x*74.+worldPosition.y*13.)*5.+sin(worldPosition.y*91.)*3.)*(1.-distantBlur*.72);
        color=vec3(132.+weave,113.+weave,43.+weave*.45);
        ivec2 wrappedCell=wrapped(cell);
        if(((wrappedCell.x+wrappedCell.y)&1)==1) color*=.93;
        int hints=int(floor(data.b*8.+.5));
        for(int stain=0;stain<8;stain++) if(stain<hints) color-=vec3(21.,19.,11.)*stainMask(vec2(wrappedCell),local,stain);
      }
    }
    float baseLight=visibility(distanceValue)*(1.-emissive)+pow(visibility(distanceValue),.75)*emissive;
    float lightBoost=min(1.12,baseLight+localLamp(worldPosition)*lampRange*.32)*u_flicker;
    color*=lightBoost/255.;
  }

  float radial=length((v_uv-vec2(.5,.52))*vec2(1.,1.18));
  color += vec3(1.,.97,.68)*max(0.,.09*(1.-radial*1.55))*u_flicker;
  color *= 1.-smoothstep(.3,.78,radial)*.3;
  float grain=(hash21(gl_FragCoord.xy+floor(u_time*14.))-0.5)*.035;
  color+=grain;
  outColor=vec4(clamp(color,0.,1.),1.);
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to allocate shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "Shader compilation failed";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function texture(gl: WebGL2RenderingContext) {
  const value = gl.createTexture();
  if (!value) throw new Error("Unable to allocate texture");
  gl.bindTexture(gl.TEXTURE_2D, value);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return value;
}

export function createWebGLRenderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, powerPreference: "high-performance" });
  if (!gl) return null;
  try {
    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!program) throw new Error("Unable to allocate WebGL program");
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    gl.deleteShader(vertex); gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "Program link failed");
    const position = gl.getAttribLocation(program, "a_position");
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const mapTexture = texture(gl), lampTexture = texture(gl), markTexture = texture(gl);
    const uniform = (name: string) => gl.getUniformLocation(program, name);
    const uniforms = Object.fromEntries([
      "u_resolution","u_player","u_angle","u_pitch","u_height","u_ceiling","u_fov","u_maxDistance","u_time","u_flicker","u_size","u_seed","u_bobY","u_exit","u_hover",
    ].map(name => [name,uniform(name)]));
    gl.useProgram(program);
    gl.uniform1i(uniform("u_map"), 0); gl.uniform1i(uniform("u_lamps"), 1); gl.uniform1i(uniform("u_marks"), 2);
    canvas.dataset.renderer = "webgl2";
    let textureSize = 0;
    let map = new Uint8Array(), lamps = new Uint8Array(), marks = new Uint8Array();

    const render = (frame: WebGLFrame) => {
      const count = frame.world.size * frame.world.size;
      if (textureSize !== frame.world.size) {
        textureSize = frame.world.size;
        map = new Uint8Array(count*4); lamps = new Uint8Array(count*4); marks = new Uint8Array(count*4);
        for (const [unit,value] of [[0,mapTexture],[1,lampTexture],[2,markTexture]] as const) {
          gl.activeTexture(gl.TEXTURE0+unit); gl.bindTexture(gl.TEXTURE_2D,value);
          gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,textureSize,textureSize,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
        }
      }
      marks.fill(0);
      const codes = { open: 0, wall: 1, pit: 2, goal: 3, pillar: 4 } as const;
      for (let i=0;i<count;i++) {
        map[i*4] = Math.round(codes[frame.world.cells[i]] / 5 * 255);
        map[i*4+1] = frame.revealedPits.has(i) ? 255 : 0;
        map[i*4+2] = Math.round(Math.min(8,frame.pitHints[i]) / 8 * 255);
        map[i*4+3] = Math.round(frame.lampLight[i] * 255);
        lamps[i*4] = frame.lamps[i].active ? 255 : 0;
        lamps[i*4+3] = 255;
      }
      const faceChannel: Record<string,number> = { north:0, south:1, east:2, west:3 };
      for (const value of frame.wallMarks) {
        const [indexText,face] = value.split(":");
        const index = Number(indexText), channel = faceChannel[face];
        if (Number.isInteger(index) && channel !== undefined && index >= 0 && index < count) marks[index*4+channel]=255;
      }
      const upload = (unit: number, value: WebGLTexture, data: Uint8Array) => {
        gl.activeTexture(gl.TEXTURE0+unit); gl.bindTexture(gl.TEXTURE_2D,value);
        gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,textureSize,textureSize,gl.RGBA,gl.UNSIGNED_BYTE,data);
      };
      upload(0,mapTexture,map); upload(1,lampTexture,lamps); upload(2,markTexture,marks);
      gl.viewport(0,0,canvas.width,canvas.height); gl.useProgram(program);
      gl.uniform2f(uniforms.u_resolution,canvas.width,canvas.height);
      gl.uniform2f(uniforms.u_player,frame.playerX,frame.playerY);
      gl.uniform1f(uniforms.u_angle,frame.angle); gl.uniform1f(uniforms.u_pitch,frame.pitch);
      gl.uniform1f(uniforms.u_height,frame.cameraHeight); gl.uniform1f(uniforms.u_ceiling,frame.ceilingHeight);
      gl.uniform1f(uniforms.u_fov,frame.fov); gl.uniform1f(uniforms.u_maxDistance,frame.maxDistance);
      gl.uniform1f(uniforms.u_time,frame.now/1000); gl.uniform1f(uniforms.u_flicker,frame.flicker ? .94+Math.sin(frame.now*.0027)*.025+(Math.sin(frame.now*.017)>.985?-.12:0) : 1);
      gl.uniform1f(uniforms.u_size,frame.world.size); gl.uniform1f(uniforms.u_seed,frame.world.seed);
      gl.uniform1f(uniforms.u_bobY,frame.bobY);
      gl.uniform2f(uniforms.u_exit,frame.exit?.x ?? -99,frame.exit?.y ?? -99);
      gl.uniform2f(uniforms.u_hover,frame.hover?.x ?? -99,frame.hover?.y ?? -99);
      gl.drawArrays(gl.TRIANGLES,0,6);
    };
    return { render, dispose: () => { delete canvas.dataset.renderer; gl.deleteTexture(mapTexture); gl.deleteTexture(lampTexture); gl.deleteTexture(markTexture); gl.deleteBuffer(buffer); gl.deleteProgram(program); } };
  } catch (error) {
    console.warn("WebGL renderer unavailable; falling back to Canvas 2D.", error);
    return null;
  }
}
