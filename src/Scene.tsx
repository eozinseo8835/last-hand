import { useEffect, useState } from 'react';
export function Revolver({ raised = false, ai = false }: { raised?: boolean; ai?: boolean }) {
  return <svg className={`revolver ${raised ? 'raised' : ''} ${ai ? 'ai-gun' : ''}`} viewBox="0 0 280 150" aria-hidden="true">
    <defs><linearGradient id="steel" x2="0.2" y2="1"><stop stopColor="#8b8c80"/><stop offset=".28" stopColor="#50564f"/><stop offset=".5" stopColor="#242b28"/><stop offset=".65" stopColor="#62665b"/><stop offset="1" stopColor="#1a201d"/></linearGradient><linearGradient id="grip" x2="1" y2=".8"><stop stopColor="#624334"/><stop offset="1" stopColor="#261d18"/></linearGradient></defs>
    <path d="M64 67L42 130Q38 142 60 142L86 139Q95 136 92 126L81 87Z" fill="url(#grip)" stroke="#151713" strokeWidth="3"/>
    <path d="M48 128L62 85M56 132L72 87M65 131L78 100" stroke="#1d1915" strokeWidth="2" opacity=".6"/>
    <path d="M82 74C134 64 142 113 102 116Q87 115 82 102M90 84Q119 77 119 98Q117 111 101 109" fill="url(#steel)" fillRule="evenodd" stroke="#1d221d" strokeWidth="3"/>
    <path d="M98 80Q96 97 105 101" fill="none" stroke="#84877a" strokeWidth="4"/>
    <path d="M49 35L60 24L78 31L95 34L107 29L246 29L251 34L250 57L122 61L118 77L75 86L52 68Z" fill="url(#steel)" stroke="#171e19" strokeWidth="3"/>
    <path d="M122 31L245 31M129 56L247 52" stroke="#a4a797" strokeWidth="2" opacity=".6"/>
    <path d="M236 29L237 22L247 22L248 30M65 31L58 16L49 12L43 17L51 29" fill="#454c42" stroke="#1a201b" strokeWidth="2"/>
    <rect x="79" y="32" width="48" height="44" rx="12" fill="url(#steel)" stroke="#151b17" strokeWidth="3"/>
    <path d="M90 39L89 65M106 37L105 69M120 39L118 64" stroke="#161d17" strokeWidth="5" strokeLinecap="round"/>
    <path d="M92 38L91 62M108 38L107 66" stroke="#72776a" strokeWidth="1.5"/>
    <circle cx="63" cy="54" r="4" fill="#1c221a" stroke="#6b7260"/><circle cx="66" cy="115" r="3" fill="#b0a18a"/>
  </svg>;
}

export default function Scene({ intro, danger, suspense, dead, blood, lowGore }: { intro: boolean; danger: boolean; suspense: boolean; dead: 'player' | 'ai' | null; blood: boolean; lowGore: boolean }) {
 const [flicker, setFlicker] = useState(false);
 useEffect(() => {
  let pause: ReturnType<typeof setTimeout>, flash: ReturnType<typeof setTimeout>;
  const schedule = () => { pause = setTimeout(() => {
   setFlicker(true); flash = setTimeout(() => { setFlicker(false); schedule(); }, 65 + Math.random() * 115);
  }, (danger ? 900 : 2600) + Math.random() * (danger ? 1800 : 5000)); };
  schedule(); return () => { clearTimeout(pause); clearTimeout(flash); };
 }, [danger]);
 const center = intro ? 930 : 720;
 return <svg className={`room-art ${danger ? 'danger' : ''} ${suspense ? 'dimmed' : ''} ${dead === 'player' ? 'fallen' : ''}`} viewBox="0 0 1440 810" aria-hidden="true">
  <defs>
   <radialGradient id="roomLight" cx="61%" cy="43%" r="59%"><stop stopColor="#333328"/><stop offset=".48" stopColor="#191d19"/><stop offset="1" stopColor="#0b0e0d"/></radialGradient>
   <radialGradient id="felt" cx="59%" cy="27%" r="74%"><stop stopColor="#3b4840"/><stop offset=".4" stopColor="#273a31"/><stop offset="1" stopColor="#101e19"/></radialGradient>
   <linearGradient id="wood" x2="0" y2="1"><stop stopColor="#66503b"/><stop offset=".4" stopColor="#31281f"/><stop offset="1" stopColor="#141510"/></linearGradient>
   <linearGradient id="suit" x2="1" y2=".6"><stop stopColor="#101614"/><stop offset=".5" stopColor="#242b27"/><stop offset="1" stopColor="#0b100e"/></linearGradient>
   <radialGradient id="mask" cx="39%" cy="30%" r="75%"><stop stopColor="#c8bfa1"/><stop offset=".4" stopColor="#9c9783"/><stop offset=".8" stopColor="#666a5d"/><stop offset="1" stopColor="#333d33"/></radialGradient>
   <linearGradient id="beam" x2="0" y2="1"><stop stopColor="#e9d4a5" stopOpacity=".09"/><stop offset="1" stopColor="#ddcca4" stopOpacity="0"/></linearGradient>
   <radialGradient id="bulbGlow"><stop stopColor="#ffdf99" stopOpacity=".34"/><stop offset=".2" stopColor="#dca654" stopOpacity=".08"/><stop offset="1" stopColor="#dca654" stopOpacity="0"/></radialGradient>
   <linearGradient id="skin" x2=".7" y2="1"><stop stopColor="#857c65"/><stop offset=".5" stopColor="#575847"/><stop offset="1" stopColor="#292f25"/></linearGradient>
   <filter id="grain"><feTurbulence baseFrequency=".78" numOctaves="3" seed="9" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".12"/></feComponentTransfer><feBlend in="SourceGraphic" mode="soft-light"/></filter>
   <filter id="blur"><feGaussianBlur stdDeviation="13"/></filter>
   <radialGradient id="vignette"><stop offset=".35" stopOpacity="0"/><stop offset="1" stopOpacity=".78"/></radialGradient>
  </defs>
  <rect width="1440" height="810" fill="url(#roomLight)"/>
  <g opacity=".23" stroke="#606457" fill="none"><path d="M120 0V510M345 0V450M1100 0V450M1325 0V510"/><path d="M0 392H1440M0 399H1440" strokeWidth="4"/><path d="M160 0V380H320V0M1125 0V380H1295V0"/></g>
  <path d="M0 75Q720 5 1440 75M0 92Q720 22 1440 92" fill="none" stroke="#090c0b" strokeWidth="13"/>
  <path d={`M${center - 9} 116L${center - 440} 650H${center + 430}L${center + 9} 116Z`} fill="url(#beam)"/>
  <ellipse cx={center} cy="436" rx="190" ry="34" fill="#080c09" opacity=".7"/>
  <g transform={`translate(${center} 0)`} className={`opponent ${dead === 'ai' ? 'slumped' : ''}`}>
   <path d="M-127 360Q-133 291 -97 282L100 282Q138 300 126 368L140 467H-140Z" fill="#141a16" stroke="#31382d" strokeWidth="3"/>
   <path d="M-40 296L-87 312Q-119 319 -136 362L-182 433L-119 456L-65 401L-69 461H77L63 391L119 451L181 428L135 352Q120 325 86 312L36 294Z" fill="url(#suit)" stroke="#2c342b" strokeWidth="1.5"/>
   <path d="M-28 285L-35 318L0 410L35 318L25 285Z" fill="#3c4035"/>
   <path d="M-16 315L0 329L17 315L7 345L15 395L0 416L-12 390L-6 344Z" fill="#141b17"/>
   <path d="M-36 302L-68 319L-48 349L-66 363L-9 437L-29 347ZM36 302L68 319L48 349L66 363L10 437L29 347Z" fill="#31392f" stroke="#45493a" strokeWidth=".8"/>
   <path d="M-133 395L-109 417M132 393L112 412M-62 420H-35" stroke="#424737" strokeWidth="2" opacity=".6"/>
   <path d="M-30 277L-28 309Q0 326 29 307L29 272" fill="#343d31"/>
   <path d="M-53 231Q-68 178 -39 154Q0 130 40 155Q64 173 54 229L41 278Q30 307 1 316Q-33 307 -44 280Z" fill="#161d17"/>
   <path d="M-46 195Q-45 158 0 157Q47 157 47 199L40 254Q36 279 0 296Q-34 282 -40 256Z" fill="url(#mask)" stroke="#797b67" strokeWidth=".8"/>
   <path d="M-30 180Q-10 164 13 171M-35 195Q-37 226 -29 247" fill="none" stroke="#d2c6a3" strokeWidth="2" opacity=".2"/>
   <path d="M29 187Q44 221 28 263L5 284Q33 267 36 240Z" fill="#3c473a" opacity=".2"/>
   <path d="M-164 429Q-170 433 -181 436L-213 442Q-226 447 -220 452L-187 449L-210 459Q-219 466 -209 468L-178 458L-197 472Q-203 478 -193 479L-167 464L-181 477Q-185 484 -175 482L-143 463L-126 451Z" fill="url(#skin)" stroke="#333e2e"/>
   <path d="M159 427Q169 433 181 435L213 441Q226 446 220 451L187 448L210 458Q219 465 209 467L178 457L197 471Q203 477 193 478L167 463L181 476Q185 483 175 481L143 462L126 450Z" fill="url(#skin)" stroke="#333e2e"/>
  </g>
  <path d="M-110 554Q720 297 1550 554L1580 846H-140Z" fill="url(#wood)" stroke="#463a2c" strokeWidth="4"/>
  <path d="M-80 560Q720 323 1520 560L1530 811H-90Z" fill="url(#felt)" stroke="#7a6950" strokeOpacity=".36" strokeWidth="3"/>
  <path d="M-50 568Q720 345 1490 568" fill="none" stroke="#b09d76" strokeOpacity=".14" strokeWidth="1"/>
  <g stroke="#b9b49a" opacity=".09"><path d="M114 620L174 603M1040 503L1093 505M1170 704L1237 716M341 754L365 747M510 478L535 474"/><path d="M230 513L245 516M1140 576L1169 570M857 766L877 760"/></g>
  <ellipse cx={center} cy="547" rx="205" ry="90" fill="#a3a788" opacity=".025" filter="url(#blur)"/>
  <g className="player-hands" fill="url(#skin)" stroke="#202c22" strokeWidth="2">
   <path d="M188 810L264 728Q274 715 287 716L320 697L339 687Q352 687 346 699L320 720L352 708Q367 707 361 718L337 731L365 724Q382 723 375 736L347 749L376 742Q389 744 383 753L337 779L326 810Z"/>
   <path d="M1252 810L1176 728Q1166 715 1153 716L1120 697L1101 687Q1088 687 1094 699L1120 720L1088 708Q1073 707 1079 718L1103 731L1075 724Q1058 723 1065 736L1093 749L1064 742Q1051 744 1057 753L1103 779L1114 810Z"/>
   <path d="M170 810L249 733L287 776L275 810ZM1270 810L1191 733L1153 776L1165 810Z" fill="#131e19" stroke="#323c2e"/>
  </g>
  {blood && !lowGore && <g fill="#6a221c" opacity=".85"><path d="M628 293l12-38 9 35 42-21-20 35 48 19-47 3-8 40-20-34-40 22 13-35-28-23z"/><circle cx="614" cy="267" r="5"/><circle cx="696" cy="282" r="8"/><circle cx="600" cy="318" r="7"/><path d="M665 477q53-19 100 4l39 18-79 9-68-13z"/></g>}
  <g transform={`translate(${center} 0)`} className={`hanging-lamp ${blood ? 'swing' : ''}`} style={{opacity:flicker ? .45 : 1}}>
   <circle cy="103" r="145" fill="url(#bulbGlow)"/>
   <path d="M0-20V71" stroke="#070a08" strokeWidth="5"/><path d="M-11 72L-16 94H16L11 72Z" fill="#3a372b" stroke="#59513a"/>
   <path className="bulb" d="M-13 95Q-25 119 -11 132Q0 140 11 132Q25 119 13 95Z" fill="#eed4a0"/><path d="M-5 101L-3 122H3L5 101" stroke="#fff3ca" strokeWidth="1.5" fill="none"/>
   <path d="M-16 94H16M-12 84H12M-12 89H12" stroke="#776448" strokeWidth="2"/>
  </g>
  <rect width="1440" height="810" filter="url(#grain)" opacity=".23" style={{mixBlendMode:'soft-light'}}/>
  <rect width="1440" height="810" fill="url(#vignette)" pointerEvents="none"/>
 </svg>;
}
