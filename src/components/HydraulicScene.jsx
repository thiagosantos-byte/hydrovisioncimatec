import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, MeshReflectorMaterial, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import {
  brushedMetalTexture, causticTexture, concreteTexture, corrugatedTexture, hazardStripeTexture,
  microNormalTexture, nameplateTexture, paintedMetalTexture, signTexture
} from '../lib/textures.js';

/* ------------------------------------------------------------------ materiais */

const mat = {
  stainless: { color: '#ccd7db', metalness: 0.9, roughness: 0.16, envMapIntensity: 2.3 },
  brushed: { color: '#94a7ad', metalness: 0.9, roughness: 0.3, envMapIntensity: 1.65 },
  darkMetal: { color: '#3d525b', metalness: 0.82, roughness: 0.34, envMapIntensity: 1.3 },
  blue: { color: '#1a5c8a', metalness: 0.72, roughness: 0.24, clearcoat: 0.6, clearcoatRoughness: 0.16, envMapIntensity: 1.55 },
  blueEdge: { color: '#2d7ba6', metalness: 0.68, roughness: 0.24, clearcoat: 0.55, envMapIntensity: 1.5 },
  rubber: { color: '#161d20', metalness: 0.05, roughness: 0.92 },
  brass: { color: '#c39a55', metalness: 0.96, roughness: 0.25, envMapIntensity: 1.7 },
  hazard: { color: '#d8b02c', metalness: 0.36, roughness: 0.58 }
};

let SURFACES = null;
function surfaces() {
  if (SURFACES) return SURFACES;
  SURFACES = {
    steelRough: brushedMetalTexture([5, 5]),
    paintRough: paintedMetalTexture([3, 3], '#8f9496'),
    blueRough: paintedMetalTexture([3, 3], '#8fa3ae'),
    concrete: concreteTexture('dark'),
    concreteLight: concreteTexture('light'),
    micro: microNormalTexture([7, 7]),
    hazard: hazardStripeTexture([7, 1]),
    caustic: causticTexture([2, 2]),
    corrugated: corrugatedTexture([6, 2])
  };
  return SURFACES;
}

/** Superfície metálica com rugosidade escovada + reflexo de ambiente. */
function MetalMaterial({ tone = 'stainless', color, ...rest }) {
  const T = surfaces();
  const base = mat[tone] || mat.stainless;
  return (
    <meshPhysicalMaterial
      {...base}
      color={color || base.color}
      roughnessMap={tone === 'blue' || tone === 'blueEdge' ? T.blueRough : tone === 'darkMetal' ? T.paintRough : T.steelRough}
      envMapIntensity={base.envMapIntensity ?? 1.1}
      {...rest}
    />
  );
}

/* ------------------------------------------------------------------- ambiente */

function StudioEnvironment({ enabled = true, quality = 'balanced' }) {
  if (!enabled) return null;
  const high = quality === 'high';
  return (
    <Environment resolution={high ? 256 : 128} frames={1} background={false}>
      <Lightformer intensity={5.2} form="rect" position={[0, 6.4, 2.4]} scale={[11, 3.4, 1]} target={[0, 0, 0]} color="#f2fbff"/>
      <Lightformer intensity={2.6} form="rect" position={[-6.4, 3.8, 2.2]} scale={[4.2, 4.2, 1]} target={[0, 1, 0]} color="#bfe4f6"/>
      <Lightformer intensity={2.1} form="rect" position={[6.8, 3.4, -1]} scale={[4.2, 3.2, 1]} target={[0, 1, 0]} color="#ffd7a3"/>
      <Lightformer intensity={1.5} form="rect" position={[0, 2.4, -6.2]} scale={[11, 4.4, 1]} target={[0, 1, 0]} color="#9cc3d6"/>
      <Lightformer intensity={3.1} form="ring" position={[-4.4, 5.8, -1.8]} scale={2.6} target={[-3, 1, 0]} color="#e6f8ff"/>
      <Lightformer intensity={6.2} form="rect" position={[2.2, 4.6, 7.4]} scale={[12, 7, 1]} target={[0, 1.2, 0]} color="#ffffff"/>
      <Lightformer intensity={2.4} form="rect" position={[-7.5, 2.6, 4.4]} scale={[5, 5, 1]} target={[0, 1, 0]} color="#d6ecf7"/>
      <Lightformer intensity={1.6} form="rect" position={[0, -2.2, 1.4]} scale={[11, 5, 1]} rotation={[Math.PI / 2, 0, 0]} target={[0, 0, 0]} color="#6d848d"/>
    </Environment>
  );
}

/* --------------------------------------------------------------------- peças */

const SUCTION_PIPE_B = [[-2.25, 0.63, 0], [-1.9, 0.67, 0], [-1.55, 0.78, 0], [-1.15, 0.93, 0], [-0.87, 0.95, 0]];
const SUCTION_FLOW_PATH = [[-3.2, 0.63, 0], [-2.75, 0.63, 0], [-2.25, 0.63, 0], ...SUCTION_PIPE_B.slice(1)];
const DISCHARGE_PIPE = [[-0.55, 1.95, 0], [-0.55, 2.35, 0], [-0.32, 2.68, 0], [2.8, 2.68, 0], [3.2, 2.4, 0], [3.2, 1.8, 0]];

function Tube({ points, radius = 0.09, material = mat.stainless, onClick, selected = false }) {
  const geometry = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
    return new THREE.TubeGeometry(curve, 96, radius, 24, false);
  }, [points, radius]);
  return (
    <mesh geometry={geometry} castShadow receiveShadow onClick={(event) => { event.stopPropagation(); onClick?.(); }}>
      <MetalMaterial {...material} color={selected ? '#49bdf2' : material.color}/>
    </mesh>
  );
}

function BoltRing({ radius = 0.2, count = 8, depth = 0.025, color = '#d7dfe1' }) {
  return <>{Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    return (
      <mesh key={index} position={[Math.cos(angle) * radius, 0, Math.sin(angle) * radius]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, depth, 6]} />
        <meshStandardMaterial color={color} metalness={0.94} roughness={0.22} />
      </mesh>
    );
  })}</>;
}

function Flange({ position, axis = 'x', radius = 0.17, selected = false }) {
  const rotation = axis === 'x' ? [0, 0, Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius, 0.09, 48]} />
        <MetalMaterial color={selected ? '#49bdf2' : '#c2cdd0'} />
      </mesh>
      <mesh position={[0, 0.051, 0]}>
        <torusGeometry args={[radius * 0.79, 0.018, 10, 48]} />
        <meshStandardMaterial color="#53656d" metalness={0.92} roughness={0.26} />
      </mesh>
      <BoltRing radius={radius * 0.78} count={8}/>
    </group>
  );
}

/** Apoio de tubulação com sapata, colarinho e parafusos U. */
function PipeSupport({ position = [0, 0, 0], height = 0.6, radius = 0.13 }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.02, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.3, 0.04, 0.3]} />
        <MetalMaterial tone="darkMetal"/>
      </mesh>
      <mesh position={[0, height / 2, 0]} castShadow>
        <boxGeometry args={[0.07, height, 0.07]} />
        <MetalMaterial tone="darkMetal"/>
      </mesh>
      <mesh position={[0, height, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius * 1.05, 0.026, 10, 30, Math.PI]} />
        <MetalMaterial />
      </mesh>
    </group>
  );
}

function Nameplate({ position, rotation = [0, 0, 0], title, subtitle = '', code = '', width = 0.42, height = 0.21 }) {
  const texture = useMemo(() => nameplateTexture(title, subtitle, code), [title, subtitle, code]);
  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow>
        <boxGeometry args={[width + 0.02, height + 0.02, 0.008]} />
        <MetalMaterial tone="darkMetal"/>
      </mesh>
      <mesh position={[0, 0, 0.006]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial map={texture} roughness={0.55} metalness={0.15}/>
      </mesh>
    </group>
  );
}

function SafetySign({ position, rotation = [0, 0, 0], title, subtitle, accent = '#d9a63b', size = 0.34 }) {
  const texture = useMemo(() => signTexture(title, subtitle, accent), [title, subtitle, accent]);
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial map={texture} roughness={0.7} metalness={0.05}/>
    </mesh>
  );
}

/* --------------------------------------------------------------- instrumentos */

function Gauge({ position, value = 4.8, onClick, warning = false, offline = false }) {
  const needleRef = useRef(null);
  const target = THREE.MathUtils.clamp((value / 10) * Math.PI * 1.5 - Math.PI * 0.75, -Math.PI * 0.75, Math.PI * 0.75);
  useFrame((_, delta) => {
    if (!needleRef.current) return;
    needleRef.current.rotation.z = THREE.MathUtils.damp(needleRef.current.rotation.z, -target, 7, delta);
    if (offline) needleRef.current.rotation.z = THREE.MathUtils.damp(needleRef.current.rotation.z, 0, 4, delta);
  });
  return (
    <group position={position} onClick={(event) => { event.stopPropagation(); onClick?.(); }}>
      <mesh position={[0, 0.12, 0]} castShadow>
        <cylinderGeometry args={[0.055, 0.07, 0.22, 24]} />
        <MetalMaterial />
      </mesh>
      <mesh position={[0, 0.31, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.19, 0.19, 0.085, 48]} />
        <MetalMaterial color="#aeb9bd" roughness={0.22}/>
      </mesh>
      <group position={[0, 0.31, 0.047]}>
        <mesh position={[0, 0, 0]}>
          <circleGeometry args={[0.157, 48]} />
          <meshStandardMaterial color={offline ? '#d8c9a8' : '#eef2ee'} roughness={0.55} metalness={0.02} side={THREE.DoubleSide}/>
        </mesh>
        {Array.from({ length: 11 }, (_, index) => {
          const angle = -Math.PI * 0.75 + (index / 10) * Math.PI * 1.5;
          return (
            <mesh key={index} position={[Math.sin(angle) * 0.125, Math.cos(angle) * 0.125, 0.004]} rotation={[0, 0, -angle]}>
              <boxGeometry args={[0.006, index % 5 === 0 ? 0.025 : 0.014, 0.002]}/>
              <meshBasicMaterial color="#33434a"/>
            </mesh>
          );
        })}
        <mesh ref={needleRef} position={[0, 0, 0.009]} rotation={[0, 0, -target]}>
          <boxGeometry args={[0.009, 0.112, 0.004]}/>
          <meshStandardMaterial color={warning ? '#c95d48' : '#9c4d3e'} metalness={0.4} roughness={0.4}/>
        </mesh>
        <mesh position={[0, 0, 0.014]}>
          <circleGeometry args={[0.014, 20]}/>
          <meshStandardMaterial color="#27363d" metalness={0.7} roughness={0.3}/>
        </mesh>
        <mesh position={[0, -0.095, 0.003]}>
          <planeGeometry args={[0.105, 0.035]}/>
          <meshStandardMaterial color="#33434a" roughness={0.7}/>
        </mesh>
      </group>
      {/* vidro do mostrador com reflexo */}
      <mesh position={[0, 0.31, 0.095]}>
        <cylinderGeometry args={[0.178, 0.178, 0.012, 48]}/>
        <meshPhysicalMaterial color="#d9e4e5" transparent opacity={0.22} roughness={0.04} metalness={0.02} envMapIntensity={1.6} depthWrite={false}/>
      </mesh>
      <mesh position={[0, 0.31, 0.11]}>
        <sphereGeometry args={[0.009, 12, 12]}/>
        <MetalMaterial tone="darkMetal"/>
      </mesh>
      <mesh position={[0.125, 0.435, 0.105]}>
        <sphereGeometry args={[0.018, 12, 12]}/>
        <meshBasicMaterial color={offline ? '#d88b38' : '#49bdf2'} toneMapped={false}/>
      </mesh>
    </group>
  );
}

function LevelRadar({ onClick, level, radarOnline = true }) {
  return (
    <group position={[-4.25, 3.76, 0]} onClick={(event) => { event.stopPropagation(); onClick?.(); }}>
      <mesh castShadow>
        <cylinderGeometry args={[0.16, 0.21, 0.2, 40]}/>
        <MetalMaterial />
      </mesh>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.06, 32]}/>
        <MetalMaterial color="#253740" metalness={0.45} roughness={0.22}/>
      </mesh>
      <mesh position={[0, 0.16, 0]}>
        <sphereGeometry args={[0.025, 16, 16]}/>
        <meshBasicMaterial color={!radarOnline ? '#e7a347' : level < 25 ? '#e7a347' : '#49bdf2'}/>
      </mesh>
      <mesh position={[0, -0.15, 0]}>
        <cylinderGeometry args={[0.07, 0.08, 0.12, 24]}/>
        <MetalMaterial color="#53656d"/>
      </mesh>
      <Nameplate position={[0.26, 0.02, 0.18]} rotation={[0, 0.5, 0]} title="Radar" subtitle="Nível contínuo" code="SEN-NVL-01" width={0.24} height={0.12}/>
    </group>
  );
}

/* ---------------------------------------------------------------------- água */

function WaterSurface({ position, width = 0.71, depth = 0.075, level = 78, flow = 32.5 }) {
  const meshRef = useRef(null);
  const T = surfaces();
  const texture = useMemo(() => T.caustic.clone(), []);
  useEffect(() => {
    texture.needsUpdate = true;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2.6, 1.1);
  }, [texture]);
  const geometry = useMemo(() => new THREE.PlaneGeometry(width, depth, 32, 10), [width, depth]);

  useFrame(({ clock }, delta) => {
    const geometryRef = meshRef.current?.geometry;
    if (!geometryRef) return;
    const positions = geometryRef.attributes.position;
    const amplitude = 0.004 + THREE.MathUtils.clamp(flow / 32.5, 0, 1.3) * 0.007;
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const wave = Math.sin(x * 15 + clock.elapsedTime * 2.3) * amplitude
        + Math.cos(y * 26 - clock.elapsedTime * 1.7) * amplitude * 0.55
        + Math.sin((x + y) * 9 + clock.elapsedTime * 1.2) * amplitude * 0.4;
      positions.setZ(index, wave);
    }
    positions.needsUpdate = true;
    geometryRef.computeVertexNormals();
    texture.offset.x = (texture.offset.x + delta * 0.035) % 1;
    texture.offset.y = (texture.offset.y + delta * 0.018) % 1;
  });

  return (
    <group position={position} rotation={[-Math.PI / 2, 0, 0]} renderOrder={4}>
      <mesh ref={meshRef} geometry={geometry}>
        <meshPhysicalMaterial
          color="#2fb3cf"
          emissive="#0a4f66"
          emissiveIntensity={0.22}
          roughness={0.08}
          metalness={0.05}
          clearcoat={1}
          clearcoatRoughness={0.05}
          transmission={0.18}
          thickness={0.18}
          transparent
          opacity={0.95}
          bumpMap={texture}
          bumpScale={0.012}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/** Volume de água interno do tanque, visível pelo visor de inspeção. */
function TankWaterBody({ level }) {
  const ref = useRef(null);
  const T = surfaces();
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.material.opacity = 0.16 + Math.sin(clock.elapsedTime * 0.8) * 0.012;
  });
  const height = Math.max(0.03, 2.42 * level / 100);
  return (
    <mesh ref={ref} position={[0, -1.21 + height / 2, 0]}>
      <cylinderGeometry args={[1.0, 1.0, height, 64, 1, true]}/>
      <meshPhysicalMaterial
        color="#0d7c9d"
        roughness={0.12}
        metalness={0.02}
        transmission={0.55}
        thickness={0.7}
        transparent
        opacity={0.18}
        side={THREE.DoubleSide}
        depthWrite={false}
        bumpMap={T.caustic}
        bumpScale={0.02}
      />
    </mesh>
  );
}

/* --------------------------------------------------------------------- tanque */

function Tank({ level, selected, onSelect, radarOnline = true }) {
  const height = 3.12;
  const windowHeight = 2.42;
  const waterHeight = Math.max(0.025, windowHeight * level / 100);
  return (
    <group>
      <group position={[-4.25, 1.87, 0]} onClick={(event) => { event.stopPropagation(); onSelect('tank'); }}>
        <mesh castShadow receiveShadow>
          <cylinderGeometry args={[1.08, 1.08, height, 96, 1, true]}/>
          <MetalMaterial color={selected ? '#83c9b3' : '#c2ced2'} side={THREE.DoubleSide}/>
        </mesh>
        <TankWaterBody level={level}/>
        <mesh position={[0, 1.57, 0]} scale={[1.08, 0.24, 1.08]} castShadow>
          <sphereGeometry args={[1, 64, 32]}/>
          <MetalMaterial color="#d2dadc"/>
        </mesh>
        <mesh position={[0, -1.56, 0]} scale={[1.08, 0.22, 1.08]} castShadow>
          <sphereGeometry args={[1, 64, 32]}/>
          <MetalMaterial tone="brushed" color="#84969d"/>
        </mesh>
        {[-1.35, -0.68, 0, 0.68, 1.35].map((y, i) => (
          <mesh key={i} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[1.086, i === 2 ? 0.036 : 0.026, 12, 96]}/>
            <MetalMaterial color="#7e9097"/>
          </mesh>
        ))}
        {/* Costura de solda vertical e placa de identificação */}
        <mesh position={[0.76, 0, 0.76]} rotation={[0, Math.PI / 4, 0]}>
          <boxGeometry args={[0.02, height * 0.92, 0.012]}/>
          <MetalMaterial color="#9aa8ac"/>
        </mesh>
        <Nameplate position={[0, 0.12, 1.085]} rotation={[0, 0, 0]} title="Hidrovision" subtitle="Reservatório vertical" code="TNQ-001" width={0.5} height={0.25}/>
        {/* Boca de visita e respiro */}
        <mesh position={[0, 1.82, 0]} castShadow>
          <cylinderGeometry args={[0.28, 0.28, 0.12, 48]}/>
          <MetalMaterial tone="brushed"/>
        </mesh>
        <mesh position={[0, 1.91, 0]}>
          <cylinderGeometry args={[0.23, 0.23, 0.045, 48]}/>
          <MetalMaterial />
        </mesh>
        <BoltRing radius={0.245} count={10} depth={0.03} color="#c8d3d5"/>
        <group position={[0, -0.06, 1.075]}>
          <mesh position={[0, 0, -0.018]}>
            <boxGeometry args={[0.82, 2.42, 0.055]}/>
            <meshPhysicalMaterial color="#b9d9e0" metalness={0.08} roughness={0.06} transmission={0.62} thickness={0.22} transparent opacity={0.42} envMapIntensity={1.6} depthWrite={false}/>
          </mesh>
          <mesh position={[0, -1.21 + waterHeight / 2, -0.075]} scale={[1, waterHeight, 1]}>
            <boxGeometry args={[0.72, 1, 0.075]}/>
            <meshPhysicalMaterial color="#087fa5" metalness={0.02} roughness={0.08} transmission={0.15} thickness={0.42} transparent opacity={0.9} envMapIntensity={1.2} depthWrite={false}/>
          </mesh>
          <WaterSurface position={[0, -1.21 + waterHeight, -0.025]} width={0.71} depth={0.07} level={level}/>
          <mesh position={[0, -1.21 + waterHeight / 2, -0.018]}>
            <boxGeometry args={[0.68, Math.max(0.02, waterHeight - 0.04), 0.012]}/>
            <meshBasicMaterial color="#5dd5e9" transparent opacity={0.13} depthWrite={false}/>
          </mesh>
          {[-0.43, 0.43].map((x) => (
            <mesh key={x} position={[x, 0, 0.018]}>
              <boxGeometry args={[0.055, 2.53, 0.09]}/>
              <MetalMaterial />
            </mesh>
          ))}
          {[-1.23, 1.23].map((y) => (
            <mesh key={y} position={[0, y, 0.018]}>
              <boxGeometry args={[0.91, 0.055, 0.09]}/>
              <MetalMaterial />
            </mesh>
          ))}
          {Array.from({ length: 5 }, (_, i) => (
            <group key={i}>
              <mesh position={[0.475, -1.06 + i * 0.53, 0.055]}>
                <sphereGeometry args={[0.022, 12, 12]}/>
                <MetalMaterial />
              </mesh>
              <mesh position={[-0.475, -1.06 + i * 0.53, 0.055]}>
                <sphereGeometry args={[0.022, 12, 12]}/>
                <MetalMaterial />
              </mesh>
            </group>
          ))}
        </group>
      </group>

      {/* Pernas, chapas de base e contraventamento */}
      {[-0.72, 0.72].flatMap((x) => [-0.72, 0.72].map((z) => (
        <group key={`${x}-${z}`} position={[-4.25 + x, 0, z]}>
          <mesh position={[0, 0.42, 0]} castShadow>
            <boxGeometry args={[0.15, 0.84, 0.15]}/>
            <MetalMaterial tone="darkMetal"/>
          </mesh>
          <mesh position={[0, 0.08, 0]}>
            <boxGeometry args={[0.32, 0.07, 0.32]}/>
            <MetalMaterial />
          </mesh>
          <mesh position={[0, 0.035, 0]}>
            <boxGeometry args={[0.45, 0.05, 0.4]}/>
            <MetalMaterial tone="darkMetal"/>
          </mesh>
        </group>
      )))}
      {/* Contraventamento diagonal */}
      {[-0.72, 0.72].map((z) => (
        <mesh key={`brace-${z}`} position={[-4.25, 0.45, z]} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.05, 1.45, 0.05]}/>
          <MetalMaterial tone="darkMetal"/>
        </mesh>
      ))}

      <LevelRadar level={level} radarOnline={radarOnline} onClick={() => onSelect('sensor-level')}/>

      {/* Medidor de nível externo e válvulas de isolamento */}
      <group position={[-2.98, 1.8, 0.92]} onClick={() => onSelect('sensor-level')}>
        <mesh>
          <cylinderGeometry args={[0.055, 0.055, 2.48, 24]}/>
          <meshPhysicalMaterial color="#c6e6e9" transmission={0.55} roughness={0.06} thickness={0.1} transparent opacity={0.38} envMapIntensity={1.5}/>
        </mesh>
        <mesh position={[0, -1.24 + waterHeight / 2, 0]} scale={[1, waterHeight, 1]}>
          <cylinderGeometry args={[0.033, 0.033, 1, 20]}/>
          <meshPhysicalMaterial color="#1686aa" roughness={0.12} transparent opacity={0.85}/>
        </mesh>
        {[1.0, 0.5, 0, -0.5, -1.0].map((y) => (
          <mesh key={y} position={[0, y, 0]}>
            <boxGeometry args={[0.075, 0.012, 0.012]}/>
            <meshBasicMaterial color="#2b4a54"/>
          </mesh>
        ))}
        <mesh position={[0, 1.28, 0]}><cylinderGeometry args={[0.085, 0.085, 0.12, 24]}/><MetalMaterial /></mesh>
        <mesh position={[0, -1.28, 0]}><cylinderGeometry args={[0.085, 0.085, 0.12, 24]}/><MetalMaterial /></mesh>
      </group>

      {/* Escada com gaiola de proteção */}
      {[-5.48, -5.22].map((x) => (
        <mesh key={x} position={[x, 1.78, 0.48]} castShadow>
          <cylinderGeometry args={[0.028, 0.028, 2.8, 16]}/>
          <MetalMaterial />
        </mesh>
      ))}
      {Array.from({ length: 10 }, (_, i) => (
        <mesh key={i} position={[-5.35, 0.48 + i * 0.27, 0.48]} castShadow>
          <cylinderGeometry args={[0.022, 0.022, 0.28, 12]}/>
          <MetalMaterial />
        </mesh>
      ))}
      {Array.from({ length: 5 }, (_, i) => (
        <mesh key={`cage-${i}`} position={[-5.35, 1.35 + i * 0.42, 0.48]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.36, 0.016, 8, 24, Math.PI]}/>
          <MetalMaterial />
        </mesh>
      ))}
    </group>
  );
}

/* ---------------------------------------------------------------------- bomba */

function Pump({ running, cavitation, cavitationStrength, selected, onSelect, speed = 1 }) {
  const impeller = useRef();
  const group = useRef();
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    s.absarc(0, 0, 0.61, 0, Math.PI * 2, false);
    const inlet = new THREE.Path();
    inlet.absarc(0, 0, 0.31, 0, Math.PI * 2, true);
    s.holes.push(inlet);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.56, bevelEnabled: true, bevelSegments: 5, steps: 1, bevelSize: 0.04, bevelThickness: 0.04, curveSegments: 72 });
    g.computeVertexNormals();
    return g;
  }, []);
  const bladeGeometry = useMemo(() => {
    const blade = new THREE.Shape();
    blade.moveTo(0.035, -0.035);
    blade.bezierCurveTo(0.105, -0.02, 0.19, 0.075, 0.285, 0.19);
    blade.lineTo(0.325, 0.245);
    blade.bezierCurveTo(0.205, 0.16, 0.105, 0.055, 0.025, 0.025);
    blade.closePath();
    const geometry = new THREE.ExtrudeGeometry(blade, { depth: 0.045, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.009, bevelThickness: 0.009, curveSegments: 18 });
    geometry.computeVertexNormals();
    return geometry;
  }, []);
  useFrame(({ clock }, delta) => {
    if (running && impeller.current) impeller.current.rotation.z += delta * 4.6 * THREE.MathUtils.clamp(speed, 0.2, 1.1);
    if (group.current) {
      const shake = cavitation ? cavitationStrength * 0.006 : 0;
      group.current.position.y = 0.95 + Math.sin(clock.elapsedTime * 42) * shake;
      group.current.rotation.z = Math.sin(clock.elapsedTime * 31) * shake * 0.35;
    }
  });
  return (
    <group>
      <group ref={group} position={[-0.55, 0.95, 0]} onClick={(event) => { event.stopPropagation(); onSelect('pump'); }}>
        {/* Voluta com nervuras de reforço */}
        <mesh geometry={shape} position={[0, 0, -0.28]} castShadow receiveShadow>
          <MetalMaterial tone="blue" color={selected ? '#49bdf2' : '#164d75'}/>
        </mesh>
        {[-0.18, 0.02, 0.19].map((y, index) => (
          <mesh key={index} position={[0, y, -0.28]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.615 + Math.abs(y) * 0.05, 0.018, 8, 72, Math.PI]}/>
            <MetalMaterial tone="blueEdge"/>
          </mesh>
        ))}
        <mesh position={[0, 0, 0.305]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.335, 0.035, 14, 64]}/>
          <MetalMaterial />
        </mesh>
        <mesh position={[0, 0, 0.34]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.315, 0.315, 0.025, 64]}/>
          <meshPhysicalMaterial color="#a9c9ce" transmission={0.55} thickness={0.12} roughness={0.05} transparent opacity={0.36} envMapIntensity={1.6} depthWrite={false}/>
        </mesh>
        <group ref={impeller} position={[0, 0, 0.29]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.07, 0.07, 0.07, 32]}/>
            <MetalMaterial />
          </mesh>
          {Array.from({ length: 7 }, (_, i) => (
            <mesh key={i} geometry={bladeGeometry} position={[0, 0, -0.022]} rotation={[0, 0, (i / 7) * Math.PI * 2]} castShadow>
              <meshPhysicalMaterial color="#c2cdd0" metalness={0.93} roughness={0.2} clearcoat={0.25} clearcoatRoughness={0.24} envMapIntensity={1.4}/>
            </mesh>
          ))}
        </group>
        {Array.from({ length: 10 }, (_, i) => {
          const a = i * Math.PI * 2 / 10;
          return (
            <mesh key={i} position={[Math.cos(a) * 0.54, Math.sin(a) * 0.54, 0.37]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.025, 0.025, 0.045, 8]}/>
              <MetalMaterial />
            </mesh>
          );
        })}
        {/* Mancal e caixa de vedação */}
        <mesh position={[0, 0, -0.4]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.14, 0.17, 0.24, 32]}/>
          <MetalMaterial tone="darkMetal"/>
        </mesh>
        <mesh position={[0.34, 0.3, 0.14]} rotation={[0, 0, -0.5]}>
          <cylinderGeometry args={[0.035, 0.035, 0.2, 16]}/>
          <MetalMaterial tone="brass"/>
        </mesh>
        {/* Base e chumbadores */}
        <mesh position={[-0.05, -0.67, 0]} castShadow>
          <boxGeometry args={[0.72, 0.16, 0.84]}/>
          <MetalMaterial tone="blue"/>
        </mesh>
        <mesh position={[-0.05, -0.78, 0]}>
          <boxGeometry args={[0.9, 0.08, 1.02]}/>
          <MetalMaterial tone="darkMetal"/>
        </mesh>
        {[[-0.32, -0.4], [0.32, -0.4], [-0.32, 0.4], [0.32, 0.4]].map(([x, z], index) => (
          <mesh key={index} position={[x, -0.72, z]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.022, 0.022, 0.14, 8]}/>
            <MetalMaterial tone="brass"/>
          </mesh>
        ))}
        <Nameplate position={[0.0, -0.36, 0.44]} title="Bomba" subtitle="Centrífuga 1 estágio" code="BMB-001" width={0.34} height={0.17}/>
      </group>

      {/* Bocais de sucção e recalque */}
      <mesh position={[-1.18, 0.94, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.19, 0.21, 0.5, 48]}/>
        <MetalMaterial tone="blue"/>
      </mesh>
      <mesh position={[-0.55, 1.63, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.2, 0.55, 48]}/>
        <MetalMaterial tone="blue"/>
      </mesh>
      <mesh position={[-0.55, 1.93, 0]} castShadow>
        <cylinderGeometry args={[0.21, 0.21, 0.12, 48]}/>
        <MetalMaterial />
      </mesh>

      {/* Bolhas de vapor na sucção quando há cavitação */}
      <Bubbles active={cavitation} strength={cavitationStrength} center={[-0.55, 0.95, 0.42]} count={26} color="#eaf8fb"/>
      {cavitation && cavitationStrength > 0.35 && (
        <mesh position={[-0.9, 0.98, 0.26]}>
          <sphereGeometry args={[0.2 + cavitationStrength * 0.12, 24, 18]}/>
          <meshPhysicalMaterial color="#dff4fa" transparent opacity={0.1 + cavitationStrength * 0.12} roughness={0.4} depthWrite={false}/>
        </mesh>
      )}
    </group>
  );
}

function Bubbles({ active, center, count = 12, color = '#d4f0f3', strength = 0.55 }) {
  const refs = useRef([]);
  useFrame(({ clock }) => {
    const intensity = THREE.MathUtils.clamp(strength, 0, 1);
    const visibleCount = Math.max(1, Math.ceil(count * intensity));
    refs.current.forEach((mesh, index) => {
      if (!mesh) return;
      const t = (clock.elapsedTime * (0.18 + intensity * 0.52) + index / count) % 1;
      mesh.position.set(
        center[0] + Math.sin(index * 8 + t * 5) * (0.025 + intensity * 0.08),
        center[1] + t * (0.22 + intensity * 0.48),
        center[2] + Math.cos(index * 4 + t * 4) * (0.018 + intensity * 0.05)
      );
      mesh.scale.setScalar(0.45 + intensity * 0.8);
      mesh.visible = active && index < visibleCount;
    });
  });
  return <>{Array.from({ length: count }, (_, index) => (
    <mesh key={index} ref={(node) => { refs.current[index] = node; }}>
      <sphereGeometry args={[0.018 + (index % 3) * 0.008, 14, 14]}/>
      <meshPhysicalMaterial color={color} transparent opacity={0.72} roughness={0.04} metalness={0.01} transmission={0.55} thickness={0.12} depthWrite={false}/>
    </mesh>
  ))}</>;
}

/* ---------------------------------------------------------------------- motor */

function Motor({ running, selected, onSelect, temperature = 38 }) {
  const fan = useRef();
  const heat = THREE.MathUtils.clamp((temperature - 45) / 35, 0, 1);
  useFrame((_, delta) => { if (running && fan.current) fan.current.rotation.x += delta * 7; });
  return (
    <group onClick={(event) => { event.stopPropagation(); onSelect('motor'); }}>
      <mesh position={[1.42, 0.98, 0]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[0.44, 0.44, 1.66, 72]}/>
        <MetalMaterial tone="blue"/>
      </mesh>
      {/* Aletas de refrigeração */}
      {Array.from({ length: 26 }, (_, i) => {
        const angle = i * Math.PI * 2 / 26;
        return (
          <mesh key={i} position={[1.42, 0.98 + Math.cos(angle) * 0.405, Math.sin(angle) * 0.405]} rotation={[Math.sin(angle) * 0.09, 0, Math.PI / 2]} castShadow>
            <boxGeometry args={[1.36, 0.034, 0.06]}/>
            <MetalMaterial tone="blue" color={heat > 0.2 ? '#2f6d8f' : undefined} emissive={heat > 0.35 ? '#7a2f12' : '#000000'} emissiveIntensity={heat * 0.35}/>
          </mesh>
        );
      })}
      {[-0.86, 0.86].map((x) => (
        <mesh key={x} position={[1.42 + x, 0.98, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.46, 0.46, 0.11, 64]}/>
          <MetalMaterial />
        </mesh>
      ))}
      <mesh position={[2.36, 0.98, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.37, 0.37, 0.22, 48]}/>
        <MetalMaterial tone="darkMetal"/>
      </mesh>
      {/* Tampa do ventilador com grade */}
      <group ref={fan} position={[2.49, 0.98, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.27, 0.27, 0.045, 40]}/>
          <MetalMaterial color="#243a44"/>
        </mesh>
        {Array.from({ length: 9 }, (_, i) => (
          <mesh key={i} position={[0, Math.cos(i * Math.PI * 2 / 9) * 0.17, Math.sin(i * Math.PI * 2 / 9) * 0.17]} rotation={[i * Math.PI * 2 / 9, 0, 0]}>
            <boxGeometry args={[0.035, 0.16, 0.035]}/>
            <MetalMaterial />
          </mesh>
        ))}
      </group>
      {Array.from({ length: 6 }, (_, i) => {
        const angle = i * Math.PI / 3;
        return (
          <mesh key={`grill-${i}`} position={[2.6, 0.98 + Math.cos(angle) * 0.3, Math.sin(angle) * 0.3]} rotation={[0, 0, Math.PI / 2]}>
            <boxGeometry args={[0.03, 0.62, 0.018]}/>
            <MetalMaterial tone="brass"/>
          </mesh>
        );
      })}
      {/* Caixa de ligação, prensa-cabo e conduíte */}
      <mesh position={[1.42, 1.53, 0]} castShadow>
        <boxGeometry args={[0.5, 0.34, 0.48]}/>
        <MetalMaterial tone="blueEdge"/>
      </mesh>
      <mesh position={[1.42, 1.72, 0]}>
        <boxGeometry args={[0.39, 0.035, 0.36]}/>
        <MetalMaterial />
      </mesh>
      <mesh position={[1.42, 1.53, 0.245]}>
        <boxGeometry args={[0.22, 0.12, 0.012]}/>
        <MetalMaterial color="#d8e0df" metalness={0.55} roughness={0.32}/>
      </mesh>
      <mesh position={[1.42, 1.53, 0.26]} rotation={[0, 0, 0]}>
        <cylinderGeometry args={[0.035, 0.045, 0.09, 16]}/>
        <MetalMaterial tone="brass"/>
      </mesh>
      <mesh position={[1.42, 1.44, 0.26]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.14, 0.022, 8, 24, Math.PI]}/>
        <MetalMaterial tone="darkMetal"/>
      </mesh>
      <mesh position={[1.42, 0.36, 0]}>
        <boxGeometry args={[1.76, 0.16, 0.78]}/>
        <MetalMaterial tone="darkMetal"/>
      </mesh>
      <Nameplate position={[1.42, 0.72, 0.45]} title="Motor" subtitle="Indução trifásico" code="MTR-001 · 11 kW" width={0.34} height={0.17}/>
    </group>
  );
}

/* -------------------------------------------------------------------- válvula */

function Valve({ position, onClick, selected, open = true }) {
  const handwheelRef = useRef(null);
  useFrame((_, delta) => {
    if (!handwheelRef.current) return;
    const target = open ? 0 : Math.PI / 4;
    handwheelRef.current.rotation.z = THREE.MathUtils.damp(handwheelRef.current.rotation.z, target, 4.5, delta);
  });
  return (
    <group position={position} onClick={(event) => { event.stopPropagation(); onClick?.(); }}>
      <mesh position={[0, 0.05, 0]} castShadow>
        <sphereGeometry args={[0.22, 40, 28]}/>
        <MetalMaterial tone="blueEdge" color={selected ? '#49bdf2' : open ? '#315f77' : '#9b713d'}/>
      </mesh>
      <mesh position={[0, 0.27, 0]}>
        <cylinderGeometry args={[0.055, 0.055, 0.38, 24]}/>
        <MetalMaterial />
      </mesh>
      <group ref={handwheelRef} position={[0, 0.49, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.19, 0.025, 12, 48]}/>
          <MetalMaterial />
        </mesh>
        {Array.from({ length: 4 }, (_, i) => (
          <mesh key={i} rotation={[0, 0, i * Math.PI / 4]}>
            <boxGeometry args={[0.36, 0.025, 0.028]}/>
            <MetalMaterial />
          </mesh>
        ))}
        <mesh position={[0, 0, 0.03]}>
          <cylinderGeometry args={[0.02, 0.02, 0.03, 12]}/>
          <MetalMaterial tone="brass"/>
        </mesh>
      </group>
      <mesh position={[0, -0.2, 0]}>
        <sphereGeometry args={[0.045, 16, 16]}/>
        <meshBasicMaterial color={open ? '#49bdf2' : '#d59b50'}/>
      </mesh>
    </group>
  );
}

function SightGlass({ position, length = 0.68, radius = 0.13, active, flow = 32.5, scenario = 'normal', quality = 'balanced' }) {
  const droplets = useRef([]);
  const count = quality === 'economy' ? 5 : quality === 'high' ? 14 : 9;
  const normalizedFlow = THREE.MathUtils.clamp(flow / 32.5, 0, 1.25);
  const bubbleColor = scenario === 'air' ? '#d5f1ff' : scenario === 'cavitation' ? '#cdeeff' : '#9cecff';
  const texture = useMemo(() => causticTexture([1, 2]), []);

  useFrame(({ clock }, delta) => {
    const speed = 0.18 + normalizedFlow * 0.38;
    droplets.current.forEach((node, index) => {
      if (!node) return;
      const t = (clock.elapsedTime * speed + index / count) % 1;
      const angle = index * 2.399;
      node.position.set(Math.cos(angle) * radius * 0.36, (t - 0.5) * length * 0.82, Math.sin(angle) * radius * 0.36);
      const pulse = 0.78 + Math.sin(clock.elapsedTime * 4 + index) * 0.16;
      node.scale.set(0.7 * pulse, 1.55 * pulse, 0.7 * pulse);
      node.visible = active && normalizedFlow > 0.015;
    });
    texture.offset.y = (texture.offset.y - delta * (0.15 + normalizedFlow * 0.5)) % 1;
  });

  return (
    <group position={position} rotation={[0, 0, -Math.PI / 2]}>
      <mesh renderOrder={3}>
        <cylinderGeometry args={[radius, radius, length, 48, 1, true]}/>
        <meshPhysicalMaterial color="#bcecf2" metalness={0.02} roughness={0.035} transmission={0.92} thickness={0.16} transparent opacity={0.32} side={THREE.DoubleSide} envMapIntensity={1.7} depthWrite={false}/>
      </mesh>
      <mesh>
        <cylinderGeometry args={[radius * 0.69, radius * 0.69, length * 0.94, 40]}/>
        <meshPhysicalMaterial
          color={active ? '#22a9ce' : '#718d95'}
          emissive={active ? '#07516c' : '#132c35'}
          emissiveIntensity={active ? 0.42 : 0.08}
          roughness={0.07}
          metalness={0.01}
          transparent
          opacity={active ? 0.8 : 0.3}
          transmission={0.12}
          bumpMap={active ? texture : null}
          bumpScale={0.01}
          depthWrite={false}
        />
      </mesh>
      {[-length / 2, length / 2].map((y) => (
        <group key={y} position={[0, y, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[radius * 1.04, 0.025, 10, 40]}/>
            <MetalMaterial color="#c6d3d5"/>
          </mesh>
          <mesh>
            <cylinderGeometry args={[radius * 0.92, radius * 0.92, 0.045, 40]}/>
            <MetalMaterial color="#87999f"/>
          </mesh>
        </group>
      ))}
      {Array.from({ length: count }, (_, index) => (
        <mesh key={index} ref={(node) => { droplets.current[index] = node; }}>
          <sphereGeometry args={[scenario === 'normal' ? 0.026 : 0.034, 12, 10]}/>
          <meshBasicMaterial color={bubbleColor} transparent opacity={0.88} toneMapped={false}/>
        </mesh>
      ))}
      <mesh position={[0, 0, radius * 0.74]}>
        <boxGeometry args={[radius * 0.12, length * 0.72, 0.006]}/>
        <meshBasicMaterial color="#e3fbff" transparent opacity={0.22} toneMapped={false}/>
      </mesh>
    </group>
  );
}

function FlowCore({ points, radius = 0.05, active, speed = 1 }) {
  const texture = useMemo(() => causticTexture([2, 6]), []);
  const geometry = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
    return new THREE.TubeGeometry(curve, 96, radius, 14, false);
  }, [points, radius]);
  useFrame((_, delta) => { texture.offset.x = (texture.offset.x + delta * 0.35 * speed) % 1; });
  return (
    <mesh geometry={geometry} visible={active} renderOrder={2}>
      <meshPhysicalMaterial
        color="#35bce0"
        emissive="#0c607c"
        emissiveIntensity={0.34}
        metalness={0.01}
        roughness={0.06}
        transmission={0.16}
        thickness={0.18}
        transparent
        opacity={0.72}
        bumpMap={texture}
        bumpScale={0.02}
        depthWrite={false}
      />
    </mesh>
  );
}

function FlowParticles({ active, scenario, flow = 32.5, count = 16 }) {
  const refs = useRef([]);
  const suctionCurve = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(-3.12, 0.63, 0), new THREE.Vector3(-2.55, 0.63, 0), new THREE.Vector3(-1.95, 0.65, 0), new THREE.Vector3(-1.35, 0.83, 0), new THREE.Vector3(-0.86, 0.95, 0)
  ]), []);
  const dischargeCurve = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.55, 1.92, 0), new THREE.Vector3(-0.55, 2.4, 0), new THREE.Vector3(-0.32, 2.75, 0), new THREE.Vector3(2.9, 2.75, 0), new THREE.Vector3(3.25, 2.4, 0), new THREE.Vector3(3.25, 1.75, 0)
  ]), []);
  const tangent = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const upDirection = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  useFrame(({ clock }) => {
    const normalizedFlow = THREE.MathUtils.clamp(flow / 32.5, 0, 1.25);
    const visibleCount = Math.ceil(count * Math.min(1, normalizedFlow));
    refs.current.forEach((node, index) => {
      if (!node) return;
      const half = Math.ceil(count / 2);
      const onDischarge = index >= half;
      const curve = onDischarge ? dischargeCurve : suctionCurve;
      const t = (clock.elapsedTime * (0.18 + normalizedFlow * 0.5) + (index % half) / half) % 1;
      node.position.copy(curve.getPointAt(t));
      curve.getTangentAt(t, tangent).normalize();
      node.quaternion.setFromUnitVectors(upDirection, tangent);
      const pulse = 0.78 + Math.sin(clock.elapsedTime * 6 + index * 1.7) * 0.2;
      node.scale.set(0.78 * pulse, 2.4 * pulse, 0.78 * pulse);
      node.visible = active && normalizedFlow > 0.015 && index < visibleCount;
    });
  });
  const particleColor = scenario === 'air' ? '#a6e5ed' : scenario === 'cavitation' ? '#c5e6f5' : '#77d8eb';
  return <>{Array.from({ length: count }, (_, index) => (
    <mesh key={index} ref={(node) => { refs.current[index] = node; }}>
      <sphereGeometry args={[0.037, 14, 12]}/>
      <meshBasicMaterial color={particleColor} transparent opacity={0.96} toneMapped={false} blending={THREE.AdditiveBlending} depthWrite={false}/>
    </mesh>
  ))}</>;
}

/* ------------------------------------------------------------------ ambiente 3D */

function IndustrialBackdrop({ theme }) {
  const wallColor = theme === 'dark' ? '#93a6ad' : '#d3dbdb';
  const beamColor = theme === 'dark' ? '#5c7681' : '#8ea1a6';
  const T = surfaces();
  return (
    <group>
      <mesh position={[0, 3.2, -3.85]} receiveShadow>
        <boxGeometry args={[17, 7.2, 0.3]}/>
        <meshStandardMaterial color={wallColor} roughness={0.88} metalness={0.16} map={theme === 'dark' ? T.concrete : T.concreteLight} bumpMap={T.corrugated} bumpScale={0.09}/>
      </mesh>
      {[-7.0, -4.6, -2.25, 0.15, 2.55, 4.95, 7.25].map((x) => (
        <mesh key={x} position={[x, 3.15, -3.58]} castShadow>
          <boxGeometry args={[0.17, 6.4, 0.2]}/>
          <MetalMaterial color={beamColor} metalness={0.78} roughness={0.34}/>
        </mesh>
      ))}
      {[1.0, 3.0, 5.05].map((y) => (
        <mesh key={y} position={[0, y, -3.57]}>
          <boxGeometry args={[16.8, 0.105, 0.18]}/>
          <MetalMaterial color={beamColor} metalness={0.72} roughness={0.38}/>
        </mesh>
      ))}
      {/* Janelas envidraçadas altas: luz natural e leitura de galpão industrial */}
      <group position={[0, 4.35, -3.66]}>
        <mesh>
          <planeGeometry args={[7.9, 1.62]}/>
          <meshBasicMaterial color={theme === 'dark' ? '#9fc9dd' : '#dcecf3'} toneMapped={false}/>
        </mesh>
        <mesh position={[0, 0.02, 0.012]}>
          <planeGeometry args={[7.9, 1.6]}/>
          <meshBasicMaterial color="#eaf7ff" transparent opacity={0.55} toneMapped={false}/>
        </mesh>
        {[-3.95, -1.98, 0, 1.98, 3.95].map((x) => (
          <mesh key={`mullion-${x}`} position={[x, 0, 0.05]}>
            <boxGeometry args={[0.07, 1.72, 0.09]}/>
            <MetalMaterial color={beamColor} metalness={0.8} roughness={0.32}/>
          </mesh>
        ))}
        {[-0.4, 0.4].map((y) => (
          <mesh key={`rail-${y}`} position={[0, y, 0.05]}>
            <boxGeometry args={[7.95, 0.055, 0.085]}/>
            <MetalMaterial color={beamColor} metalness={0.8} roughness={0.32}/>
          </mesh>
        ))}
        {[-3.96, 3.96].map((x) => (
          <mesh key={`jamb-${x}`} position={[x, 0, 0.06]}>
            <boxGeometry args={[0.1, 1.78, 0.11]}/>
            <MetalMaterial color={beamColor} metalness={0.8} roughness={0.32}/>
          </mesh>
        ))}
      </group>

      {/* Painéis elétricos com telas e sinalização */}
      {[-5.7, 5.65].map((x, index) => (
        <group key={x} position={[x, 2.18, -3.37]}>
          <mesh castShadow>
            <boxGeometry args={[1.15, 1.55, 0.18]}/>
            <MetalMaterial tone="darkMetal" color={theme === 'dark' ? '#4d6873' : '#9aa8ac'}/>
          </mesh>
          <mesh position={[0, 0, 0.105]}>
            <boxGeometry args={[0.82, 1.18, 0.018]}/>
            <MetalMaterial tone="darkMetal" color={theme === 'dark' ? '#334c57' : '#6d8187'}/>
          </mesh>
          {[-0.36, 0, 0.36].map((y, i) => (
            <mesh key={i} position={[0.3, y, 0.125]}>
              <sphereGeometry args={[0.035, 12, 12]}/>
              <meshBasicMaterial color={i === 0 ? '#49bdf2' : i === 1 ? '#d6ad61' : '#66b8d2'} toneMapped={false}/>
            </mesh>
          ))}
          <mesh position={[-0.14, 0.28, 0.125]}>
            <boxGeometry args={[0.4, 0.26, 0.01]}/>
            <meshBasicMaterial color="#123845"/>
          </mesh>
          <mesh position={[-0.14, 0.28, 0.132]}>
            <planeGeometry args={[0.36, 0.22]}/>
            <meshBasicMaterial color="#2fa9c9" transparent opacity={0.82} toneMapped={false}/>
          </mesh>
          <mesh position={[-0.14, 0.28, 0.134]}>
            <planeGeometry args={[0.34, 0.2]}/>
            <meshBasicMaterial color="#bff0ff" transparent opacity={0.16} toneMapped={false}/>
          </mesh>
          <mesh position={[0, -0.62, 0.12]}>
            <boxGeometry args={[0.66, 0.06, 0.012]}/>
            <meshBasicMaterial color="#d8e6e8"/>
          </mesh>
          <SafetySign position={[0.42, 0.62, 0.128]} title="ATENÇÃO" subtitle="ALTA TENSÃO|NÃO ABRIR" accent="#d9a63b" size={0.3}/>
        </group>
      ))}
      {/* Iluminação suspensa + cones de luz discretos */}
      <mesh position={[0, 5.6, -2.7]}>
        <boxGeometry args={[14.4, 0.16, 0.16]}/>
        <MetalMaterial color={beamColor} metalness={0.76} roughness={0.3}/>
      </mesh>
      {[-4.4, 0, 4.4].map((x) => (
        <group key={x} position={[x, 5.72, -1.95]}>
          <mesh>
            <boxGeometry args={[1.8, 0.09, 0.48]}/>
            <MetalMaterial tone="darkMetal"/>
          </mesh>
          <mesh position={[0, -0.055, 0]}>
            <boxGeometry args={[1.55, 0.018, 0.34]}/>
            <meshBasicMaterial color="#c9edf0" toneMapped={false}/>
          </mesh>
          <mesh position={[0, -0.06, 0]} rotation={[0, 0, 0]}>
            <planeGeometry args={[1.5, 0.3]}/>
            <meshBasicMaterial color="#eafcff" transparent opacity={0.25} toneMapped={false}/>
          </mesh>
        </group>
      ))}
      {/* Rack de tubulação suspenso */}
      <mesh position={[0, 4.95, -2.55]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.075, 0.075, 13.4, 32]}/>
        <MetalMaterial color="#91a5aa"/>
      </mesh>
      {[-2.1, 2.1].map((z) => (
        <mesh key={z} position={[0, 4.6, -2.55 + z * 0.28]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.055, 0.055, 13.0, 24]}/>
          <MetalMaterial color="#7c9298"/>
        </mesh>
      ))}
      {[-5.6, -2.8, 0, 2.8, 5.6].map((x) => (
        <mesh key={x} position={[x, 4.45, -2.55]}>
          <boxGeometry args={[0.09, 1.0, 0.1]}/>
          <MetalMaterial color={beamColor} metalness={0.78} roughness={0.36}/>
        </mesh>
      ))}
      {/* Bandeja de cabos na parede */}
      <group position={[3.6, 4.1, -3.42]}>
        <mesh>
          <boxGeometry args={[4.6, 0.03, 0.34]}/>
          <MetalMaterial color="#5d6f75"/>
        </mesh>
        {[-0.12, 0, 0.12].map((z, i) => (
          <mesh key={i} position={[0, 0.035, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.018, 0.018, 4.5, 12]}/>
            <meshStandardMaterial color={['#1b2429', '#25333a', '#302a22'][i]} roughness={0.85}/>
          </mesh>
        ))}
        {[-2.1, 0, 2.1].map((x) => (
          <mesh key={x} position={[x, -0.4, 0]}>
            <boxGeometry args={[0.04, 0.8, 0.04]}/>
            <MetalMaterial tone="darkMetal"/>
          </mesh>
        ))}
      </group>
    </group>
  );
}

function FloorGrid({ theme }) {
  const gridRef = useRef(null);
  useEffect(() => {
    const material = gridRef.current?.material;
    if (!material) return;
    material.transparent = true;
    material.opacity = 0.09;
    material.depthWrite = false;
    material.needsUpdate = true;
  }, []);
  return <gridHelper ref={gridRef} args={[18, 30, theme === 'dark' ? '#70848b' : '#c2d0d0', theme === 'dark' ? '#50636a' : '#91a2a5']} position={[0, -0.125, 0]}/>;
}

/** Guarda-corpo em torno da skid para dar escala e leitura industrial. */
function Handrail() {
  const posts = [[-5.35, 2.3], [-2.6, 2.3], [0.2, 2.3], [2.9, 2.3]];
  return (
    <group>
      {posts.map(([x, z]) => (
        <group key={`${x}-${z}`} position={[x, 0, z]}>
          <mesh position={[0, 0.53, 0]} castShadow>
            <cylinderGeometry args={[0.026, 0.026, 1.06, 12]}/>
            <MetalMaterial tone="hazard"/>
          </mesh>
          <mesh position={[0, 1.05, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.024, 0.024, 0.5, 12]}/>
            <MetalMaterial tone="hazard"/>
          </mesh>
        </group>
      ))}
      {[1.05, 0.62].map((y) => (
        <mesh key={y} position={[-1.15, y, 2.3]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[y > 0.9 ? 0.028 : 0.02, y > 0.9 ? 0.028 : 0.02, 8.1, 12]}/>
          <MetalMaterial tone="hazard" color={y > 0.9 ? '#c9a227' : '#8d9a9d'}/>
        </mesh>
      ))}
    </group>
  );
}

/** Calha de drenagem com grelha no piso. */
function DrainGrate({ position }) {
  return (
    <group position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <planeGeometry args={[1.5, 0.24]}/>
        <meshStandardMaterial color="#1d2a2f" roughness={0.9} metalness={0.2}/>
      </mesh>
      {Array.from({ length: 14 }, (_, i) => (
        <mesh key={i} position={[-0.7 + i * 0.108, 0, 0.012]}>
          <boxGeometry args={[0.05, 0.23, 0.02]}/>
          <MetalMaterial tone="darkMetal"/>
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------- adereços industriais */

/** Tambores, pallet, armário, cones e extintor: dão escala e vida ao galpão. */
function WorkshopProps({ theme, quality }) {
  const drumBody = (color) => (
    <>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.29, 0.29, 0.88, 32, 1]}/>
        <meshStandardMaterial color={color} metalness={0.55} roughness={0.42} envMapIntensity={1.1}/>
      </mesh>
      {[-0.24, 0, 0.24].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.292, 0.014, 8, 40]}/>
          <meshStandardMaterial color="#8d9a9e" metalness={0.8} roughness={0.34}/>
        </mesh>
      ))}
      <mesh position={[0, 0.445, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 0.03, 32]}/>
        <meshStandardMaterial color="#6e7c81" metalness={0.75} roughness={0.4}/>
      </mesh>
      <mesh position={[0.2, 0.46, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.035, 16]}/>
        <meshStandardMaterial color="#3d4a4f" metalness={0.8} roughness={0.35}/>
      </mesh>
    </>
  );
  return (
    <group>
      {/* Tambores de reserva à esquerda */}
      <group position={[-6.55, 0.44, 1.05]} rotation={[0, 0.22, 0]}>{drumBody('#2f6076')}</group>
      <group position={[-6.5, 0.44, 1.78]} rotation={[0, -0.18, 0]}>{drumBody('#7d5330')}</group>
      <group position={[-6.08, 0.44, 2.42]} rotation={[0, 0.5, 0]}>{drumBody('#3c5a63')}</group>

      {/* Pallet com caixa de peças */}
      <group position={[5.4, 0, 1.35]} rotation={[0, -0.4, 0]}>
        {[-0.3, 0, 0.3].map((z) => (
          <mesh key={`plank-${z}`} position={[0, 0.09, z]} castShadow receiveShadow>
            <boxGeometry args={[1.05, 0.035, 0.16]}/>
            <meshStandardMaterial color="#8d6d47" roughness={0.92} metalness={0.02}/>
          </mesh>
        ))}
        {[-0.42, 0, 0.42].map((x) => (
          <mesh key={`bearer-${x}`} position={[x, 0.045, 0]} castShadow>
            <boxGeometry args={[0.09, 0.07, 0.86]}/>
            <meshStandardMaterial color="#6f5537" roughness={0.94} metalness={0.02}/>
          </mesh>
        ))}
        <mesh position={[0, 0.29, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.78, 0.36, 0.66]}/>
          <meshStandardMaterial color="#9a8459" roughness={0.88} metalness={0.03}/>
        </mesh>
        <mesh position={[0, 0.29, 0.335]}>
          <planeGeometry args={[0.5, 0.18]}/>
          <meshBasicMaterial color="#e9e3d2" toneMapped={false}/>
        </mesh>
      </group>

      {/* Armário de ferramentas encostado na parede */}
      <group position={[6.1, 0, -3.05]} rotation={[0, -0.12, 0]}>
        <mesh position={[0, 0.86, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.92, 1.62, 0.46]}/>
          <meshStandardMaterial color="#4a5f68" metalness={0.6} roughness={0.4} envMapIntensity={1.2}/>
        </mesh>
        {[0.35, 0.72, 1.09, 1.46].map((y) => (
          <group key={y}>
            <mesh position={[0, y, 0.235]}>
              <planeGeometry args={[0.84, 0.3]}/>
              <meshStandardMaterial color="#3b4e56" metalness={0.55} roughness={0.45}/>
            </mesh>
            <mesh position={[0, y + 0.1, 0.26]}>
              <boxGeometry args={[0.36, 0.032, 0.03]}/>
              <meshStandardMaterial color="#b9c6c9" metalness={0.9} roughness={0.24}/>
            </mesh>
          </group>
        ))}
      </group>

      {/* Extintor de incêndio */}
      <group position={[-6.9, 0, -2.6]}>
        <mesh position={[0, 0.34, 0]} castShadow>
          <cylinderGeometry args={[0.105, 0.105, 0.62, 24]}/>
          <meshStandardMaterial color="#b03028" metalness={0.42} roughness={0.42}/>
        </mesh>
        <mesh position={[0, 0.69, 0]}>
          <cylinderGeometry args={[0.045, 0.07, 0.1, 16]}/>
          <meshStandardMaterial color="#22282a" metalness={0.6} roughness={0.5}/>
        </mesh>
        <mesh position={[0.1, 0.62, 0]} rotation={[0, 0, -0.5]}>
          <boxGeometry args={[0.03, 0.1, 0.03]}/>
          <meshStandardMaterial color="#c9c9c9" metalness={0.85} roughness={0.3}/>
        </mesh>
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.14, 0.15, 0.04, 24]}/>
          <meshStandardMaterial color="#3a464b" metalness={0.4} roughness={0.6}/>
        </mesh>
      </group>

      {/* Cones de sinalização */}
      {[[4.75, 2.5], [-6.3, 2.95]].map(([x, z], index) => (
        <group key={`cone-${index}`} position={[x, 0, z]}>
          <mesh position={[0, 0.015, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.34, 0.03, 0.34]}/>
            <meshStandardMaterial color="#d9761f" roughness={0.7} metalness={0.1}/>
          </mesh>
          <mesh position={[0, 0.24, 0]} castShadow>
            <coneGeometry args={[0.12, 0.45, 20]}/>
            <meshStandardMaterial color="#e07a1f" roughness={0.6} metalness={0.08}/>
          </mesh>
          <mesh position={[0, 0.26, 0]}>
            <cylinderGeometry args={[0.085, 0.1, 0.07, 20, 1, true]}/>
            <meshStandardMaterial color="#f2f2f2" roughness={0.5} metalness={0.05} side={THREE.DoubleSide}/>
          </mesh>
        </group>
      ))}

      {/* Demarcação de piso (pintura amarela) em volta da skid */}
      {[{
        pos: [0, -0.128, 3.05], size: [12.4, 0.055]
      }, {
        pos: [0, -0.128, -3.05], size: [12.4, 0.055]
      }, {
        pos: [-6.2, -0.128, 0], size: [0.055, 6.1]
      }, {
        pos: [6.2, -0.128, 0], size: [0.055, 6.1]
      }].map((line, index) => (
        <mesh key={`mark-${index}`} position={line.pos} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={line.size}/>
          <meshStandardMaterial color={theme === 'dark' ? '#b79330' : '#d2ae3d'} roughness={0.78} metalness={0.05}/>
        </mesh>
      ))}

      {/* Hachura de advertência junto à base */}
      {quality !== 'economy' && (
        <mesh position={[0, -0.127, 2.52]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[11.2, 0.18]}/>
          <meshStandardMaterial map={surfaces().hazard} roughness={0.75} metalness={0.08}/>
        </mesh>
      )}
    </group>
  );
}

/* --------------------------------------------------------------------- cena */

function Scene({ values, scenario, risk, selected, setSelected, theme, quality }) {
  const cavitation = scenario === 'cavitation' && risk >= 28 && values.running && values.sensorOnline && !values.solutionApplied;
  const air = scenario === 'air' && values.air >= 5 && values.running && !values.solutionApplied;
  const hasFlow = values.running && values.suctionValveOpen && values.dischargeValveOpen && values.flow > 0.01;
  const cavitationStrength = THREE.MathUtils.clamp(risk / 100, 0.08, 1);
  const background = theme === 'dark' ? '#132029' : '#94a6ac';
  const economy = quality === 'economy';
  const high = quality === 'high';
  const T = surfaces();
  const select = (id) => setSelected(id);
  const flowSpeed = THREE.MathUtils.clamp(values.flow / 32.5, 0, 1.3);

  return (
    <>
      <StudioEnvironment enabled={!economy} quality={quality}/>
      <color attach="background" args={[background]}/>
      <fog attach="fog" args={[background, 24, 48]}/>
      <ambientLight intensity={theme === 'dark' ? 0.85 : 1.05}/>
      <hemisphereLight args={['#f0faff', '#31454e', theme === 'dark' ? 1.5 : 1.8]}/>
      <directionalLight
        position={[4.5, 8.5, 6]}
        intensity={2.7}
        color="#fff6ea"
        castShadow={!economy}
        shadow-mapSize-width={high ? 2048 : 1024}
        shadow-mapSize-height={high ? 2048 : 1024}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-far={26}
      />
      <directionalLight position={[-7, 4, -2.5]} intensity={high ? 1.5 : 1.15} color="#b7e0f0"/>
      <spotLight position={[0.5, 7.6, 4.2]} angle={0.72} penumbra={0.92} intensity={high ? 3.4 : 2.4} distance={24} color="#f7fdff" castShadow={false}/>
      <spotLight position={[-4.4, 6.2, 0.5]} angle={0.55} penumbra={0.9} intensity={high ? 1.9 : 1.4} distance={18} color="#e2f2ff"/>
      {/* Luz fria vinda das janelas altas */}
      <directionalLight position={[-1.5, 5.2, -3.2]} intensity={high ? 1.5 : 1.05} color="#cfe8f7"/>
      {/* Iluminação indireta junto à alvenaria */}
      {[-4.9, 0, 4.9].map((x) => (
        <pointLight key={`wash-${x}`} position={[x, 4.2, -2.85]} intensity={high ? 1.5 : 1.0} distance={8.5} color="#dff0f8"/>
      ))}
      {!economy && <pointLight position={[-3.5, 3.1, 3.8]} intensity={0.9} color="#48acc6" distance={12}/>}
      {!economy && <pointLight position={[3.5, 4.4, -1.5]} intensity={1.0} color="#eec48a" distance={10}/>}
      {!economy && <pointLight position={[0.2, 2.4, 2.6]} intensity={0.5} color="#ffffff" distance={9}/>}
      {/* Luminárias industriais suspensas: pools de luz reais sobre a skid */}
      {[-4.4, 0, 4.4].map((x, index) => (
        <spotLight
          key={`practical-${x}`}
          position={[x, 5.66, -1.95]}
          angle={0.82}
          penumbra={0.95}
          intensity={high ? 2.9 : 2.1}
          distance={13}
          decay={1.7}
          color="#fff4e2"
          castShadow={index === 0 && !economy}
          shadow-mapSize-width={high ? 1024 : 512}
          shadow-mapSize-height={high ? 1024 : 512}
          shadow-bias={-0.0006}
          shadow-normalBias={0.03}
        />
      ))}

      <IndustrialBackdrop theme={theme}/>
      <WorkshopProps theme={theme} quality={quality}/>

      {/* Piso: concreto com reflexo suave em qualidade alta */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.14, 0]} receiveShadow>
        <planeGeometry args={[22, 18]}/>
        {high ? (
          <MeshReflectorMaterial
            resolution={512}
            mixBlur={1.1}
            mixStrength={9}
            blur={[300, 90]}
            depthScale={1.1}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.35}
            roughness={0.88}
            metalness={0.12}
            color={theme === 'dark' ? '#5e7178' : '#9aa9ad'}
            map={theme === 'dark' ? T.concrete : T.concreteLight}
            bumpMap={T.micro}
            bumpScale={0.006}
          />
        ) : (
          <meshStandardMaterial
            color={theme === 'dark' ? '#5a6c73' : '#95a4a8'}
            roughness={0.93}
            metalness={0.08}
            map={theme === 'dark' ? T.concrete : T.concreteLight}
            bumpMap={T.micro}
            bumpScale={0.004}
          />
        )}
      </mesh>
      <FloorGrid theme={theme}/>

      {/* Skid / base estrutural */}
      <mesh position={[-0.15, -0.015, 0]} receiveShadow>
        <boxGeometry args={[10.4, 0.22, 4.85]}/>
        <MetalMaterial color="#52636a" metalness={0.64} roughness={0.5}/>
      </mesh>
      {[-2.34, 2.04].map((z) => (
        <mesh key={z} position={[-0.1, 0.1005, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[9.7, 0.075]}/>
          <meshStandardMaterial map={T.hazard} roughness={0.72} metalness={0.1}/>
        </mesh>
      ))}
      {[-1.82, 1.82].map((z) => (
        <mesh key={z} position={[-0.05, 0.13, z]} castShadow>
          <boxGeometry args={[10.1, 0.14, 0.16]}/>
          <MetalMaterial />
        </mesh>
      ))}
      {[-4.2, -2.1, 0, 2.1, 4.0].map((x) => (
        <mesh key={x} position={[x, 0.14, 0]} castShadow>
          <boxGeometry args={[0.15, 0.14, 3.75]}/>
          <MetalMaterial tone="darkMetal"/>
        </mesh>
      ))}
      <DrainGrate position={[-1.0, 0.108, 1.55]}/>

      <Handrail/>
      <SafetySign position={[-3.42, 0.9, 2.42]} rotation={[0, 0, 0]} title="RISCO" subtitle="PARTES MÓVEIS|USO DE EPI" accent="#d9684f" size={0.36}/>

      <Tank level={values.level} selected={selected === 'tank'} onSelect={select} radarOnline={values.radarOnline !== false}/>

      {/* Linha de sucção */}
      <Tube points={[[-3.2, 0.63, 0], [-3.08, 0.63, 0]]} radius={0.14} selected={selected === 'suction'} onClick={() => select('suction')}/>
      <Tube points={[[-2.49, 0.63, 0], [-2.25, 0.63, 0]]} radius={0.14} selected={selected === 'suction'} onClick={() => select('suction')}/>
      <SightGlass position={[-2.785, 0.63, 0]} length={0.58} radius={0.132} active={hasFlow} flow={values.flow} scenario={scenario} quality={quality}/>
      <Tube points={SUCTION_PIPE_B} radius={0.13} selected={selected === 'suction'} onClick={() => select('suction')}/>
      <FlowCore points={SUCTION_FLOW_PATH} radius={0.052} active={hasFlow} speed={flowSpeed}/>
      <Flange position={[-2.26, 0.63, 0]} radius={0.22} selected={selected === 'suction'}/>
      <Flange position={[-0.91, 0.95, 0]} radius={0.22}/>
      <Valve position={[-2.55, 0.63, 0]} onClick={() => select('suction-valve')} selected={selected === 'suction-valve'} open={values.suctionValveOpen}/>
      <PipeSupport position={[-1.9, 0, 0.42]} height={0.42} radius={0.13}/>
      <PipeSupport position={[-2.95, 0, 0.3]} height={0.48} radius={0.14}/>
      <Nameplate position={[-1.55, 1.18, 0.16]} rotation={[0, 0, 0.05]} title="Sucção" subtitle="Linha DN80" code="SUC-001" width={0.3} height={0.15}/>

      <Pump running={values.running} cavitation={cavitation} cavitationStrength={cavitationStrength} selected={selected === 'pump'} onSelect={select} speed={values.speed || 1}/>

      {/* Linha de descarga */}
      <Tube points={[[-0.55, 1.95, 0], [-0.55, 2.35, 0], [-0.32, 2.68, 0], [0.76, 2.68, 0]]} radius={0.13} selected={selected === 'discharge'} onClick={() => select('discharge')}/>
      <Tube points={[[1.49, 2.68, 0], [2.8, 2.68, 0], [3.2, 2.4, 0], [3.2, 1.8, 0]]} radius={0.13} selected={selected === 'discharge'} onClick={() => select('discharge')}/>
      <SightGlass position={[1.125, 2.68, 0]} length={0.72} radius={0.126} active={hasFlow} flow={values.flow} scenario={scenario} quality={quality}/>
      <FlowCore points={DISCHARGE_PIPE} radius={0.05} active={hasFlow} speed={flowSpeed}/>
      <Flange position={[-0.55, 2.0, 0]} axis="y" radius={0.22}/>
      <Flange position={[3.2, 1.85, 0]} axis="y" radius={0.22}/>
      <Valve position={[2.72, 2.68, 0]} onClick={() => select('discharge-valve')} selected={selected === 'discharge-valve'} open={values.dischargeValveOpen}/>
      <PipeSupport position={[2.0, 0, -0.75]} height={2.62} radius={0.13}/>
      <PipeSupport position={[0.75, 0, -0.75]} height={2.62} radius={0.13}/>

      <Gauge position={[-1.45, 1.16, 0.18]} value={values.suction} warning={cavitation} offline={!values.sensorOnline} onClick={() => select('sensor-pressure')}/>
      <Gauge position={[1.08, 3.0, 0.18]} value={values.discharge} warning={values.discharge < 5} onClick={() => select('sensor-pressure')}/>
      <Nameplate position={[-1.45, 0.94, 0.19]} rotation={[0, 0, 0]} title="Sucção" subtitle="Pressão absoluta" code="SEN-PRS-01" width={0.22} height={0.11}/>

      {/* Medidor de vazão eletromagnético */}
      <group position={[2.0, 2.68, 0.04]} onClick={() => select('sensor-flow')}>
        <mesh rotation={[0, 0, 0]}>
          <cylinderGeometry args={[0.19, 0.19, 0.38, 40]}/>
          <MetalMaterial tone="brushed"/>
        </mesh>
        <mesh position={[0, 0.23, 0]}>
          <boxGeometry args={[0.42, 0.22, 0.3]}/>
          <MetalMaterial color="#1d3742" metalness={0.58} roughness={0.27}/>
        </mesh>
        <mesh position={[0, 0.24, 0.157]}>
          <planeGeometry args={[0.29, 0.1]}/>
          <meshBasicMaterial color="#75d8ac"/>
        </mesh>
        <mesh position={[0, 0.235, 0.16]}>
          <planeGeometry args={[0.27, 0.08]}/>
          <meshBasicMaterial color="#06231b" transparent opacity={0.5}/>
        </mesh>
      </group>

      <Motor running={values.running} selected={selected === 'motor'} onSelect={select} temperature={values.temperature}/>

      {/* Acoplamento e proteção */}
      <mesh position={[0.43, 0.98, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.16, 0.38, 32]}/>
        <MetalMaterial />
      </mesh>
      <mesh position={[0.43, 0.98, 0]}>
        <torusGeometry args={[0.2, 0.025, 12, 32]}/>
        <MetalMaterial tone="darkMetal"/>
      </mesh>
      {[1.31, 0.65].map((y) => (
        <mesh key={y} position={[0.43, y, 0]} castShadow>
          <boxGeometry args={[0.5, 0.055, 0.75]}/>
          <MetalMaterial />
        </mesh>
      ))}
      {[-0.19, -0.06, 0.07, 0.19].map((x) => (
        <mesh key={x} position={[0.43 + x, 0.98, 0.34]} rotation={[0, 0, 0]}>
          <boxGeometry args={[0.012, 0.62, 0.012]}/>
          <MetalMaterial tone="brass"/>
        </mesh>
      ))}

      <FlowParticles active={hasFlow} scenario={scenario} flow={values.flow} count={economy ? 8 : high ? 32 : 20}/>
      <Bubbles active={air} strength={values.air / 100} center={[-1.8, 0.66, 0.17]} count={economy ? 10 : 30} color="#d3f0f4"/>

      {values.level < 30 && (
        <group position={[-4.25, 4.18, 0]}>
          <mesh>
            <sphereGeometry args={[0.075, 24, 24]}/>
            <meshBasicMaterial color="#ffad45" toneMapped={false}/>
          </mesh>
          <pointLight intensity={2.4} distance={3.2} color="#ffad45"/>
        </group>
      )}

      {!economy && <ContactShadows position={[0, -0.12, 0]} opacity={0.34} scale={16} blur={high ? 2.6 : 2} far={5.5} resolution={high ? 512 : 256} frames={1}/>}
    </>
  );
}

/* ------------------------------------------------------------------- câmera */

function SceneCameraRig({ controlsRef, selected, resetKey, viewPreset }) {
  const { camera, size } = useThree();
  const animating = useRef(true);
  const destination = useRef({
    position: new THREE.Vector3(8.6, 5.6, 10.8),
    target: new THREE.Vector3(-0.8, 1.55, 0)
  });

  useEffect(() => {
    animating.current = true;
    const presets = {
      overview: { target: [-0.65, 1.55, 0], offset: [7.6, 3.5, 8.6] },
      front: { target: [-0.65, 1.55, 0], offset: [0.2, 2.5, 13.8] },
      side: { target: [-0.65, 1.55, 0], offset: [13.8, 3.35, 0.4] },
      top: { target: [-0.65, 1.15, 0], offset: [0.5, 14.6, 0.1] },
      tank: { target: [-4.25, 1.85, 0], offset: [2.9, 1.9, 4.0] },
      'sensor-level': { target: [-4.25, 2.5, 0], offset: [2.0, 1.3, 3.2] },
      pump: { target: [-0.55, 1.05, 0], offset: [2.3, 1.4, 2.9] },
      motor: { target: [1.42, 1.0, 0], offset: [2.4, 1.4, 3.0] },
      suction: { target: [-2.1, 0.8, 0], offset: [2.4, 1.6, 3.2] },
      discharge: { target: [1.35, 2.65, 0], offset: [2.4, 1.5, 3.2] },
      'suction-valve': { target: [-2.55, 0.75, 0], offset: [1.8, 1.2, 2.4] },
      'discharge-valve': { target: [2.72, 2.75, 0], offset: [1.8, 1.2, 2.4] },
      'sensor-pressure': { target: [-1.45, 1.45, 0], offset: [1.8, 1.1, 2.4] },
      'sensor-flow': { target: [2.0, 2.75, 0], offset: [1.8, 1.1, 2.4] },
      instruments: { target: [0.65, 2.65, 0], offset: [4.6, 2.0, 6.2] }
    };
    const chosen = selected || viewPreset || 'overview';
    const preset = presets[chosen] || presets.overview;
    const portraitFactor = size.width / Math.max(size.height, 1) < 0.8 ? 1.43 : size.width / Math.max(size.height, 1) < 1.15 ? 1.16 : 1;
    const target = new THREE.Vector3(...preset.target);
    const offset = new THREE.Vector3(...preset.offset).multiplyScalar(portraitFactor);
    destination.current = { position: target.clone().add(offset), target };
  }, [selected, viewPreset, resetKey, size.width, size.height]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls || !animating.current) return;
    const blend = 1 - Math.exp(-delta * 3.6);
    camera.position.lerp(destination.current.position, blend);
    controls.target.lerp(destination.current.target, blend);
    controls.update();
    if (camera.position.distanceToSquared(destination.current.position) < 0.0004 && controls.target.distanceToSquared(destination.current.target) < 0.0004) {
      animating.current = false;
    }
  });
  return null;
}

export default function HydraulicScene({ values, scenario, risk = 0, selected, setSelected, theme, resetKey = 0, compact = false, viewPreset = 'overview', quality = 'auto' }) {
  const controlsRef = useRef(null);
  const [viewport, setViewport] = useState({ width: 1280, memory: 8, cores: 8 });
  useEffect(() => {
    const update = () => setViewport({
      width: window.innerWidth,
      memory: Number(navigator.deviceMemory || 8),
      cores: Number(navigator.hardwareConcurrency || 8)
    });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const resolvedQuality = quality === 'auto'
    ? (viewport.width <= 680 || viewport.memory <= 3 || viewport.cores <= 4 ? 'economy' : viewport.width <= 1050 || viewport.memory <= 6 ? 'balanced' : 'high')
    : quality;
  const settings = {
    high: { dpr: [1.25, 1.8], antialias: true, shadows: true },
    balanced: { dpr: [1, 1.35], antialias: true, shadows: true },
    economy: { dpr: [0.75, 1.08], antialias: false, shadows: false }
  }[resolvedQuality] || { dpr: [1, 1.35], antialias: true, shadows: true };

  return (
    <div className={`scene-canvas ${compact ? 'scene-compact' : ''} quality-${resolvedQuality}`}>
      <Canvas
        shadows={settings.shadows}
        dpr={settings.dpr}
        camera={{ position: [8.0, 5.2, 9.2], fov: viewport.width <= 680 ? 44 : 33, near: 0.1, far: 90 }}
        gl={{ antialias: settings.antialias, alpha: false, powerPreference: 'high-performance', stencil: false, depth: true, logarithmicDepthBuffer: false }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = resolvedQuality === 'high' ? 1.85 : resolvedQuality === 'balanced' ? 1.72 : 1.55;
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
          gl.setClearColor(theme === 'dark' ? '#132029' : '#94a6ac', 1);
        }}
        onPointerMissed={() => setSelected(null)}
      >
        <Scene values={values} scenario={scenario} risk={risk} selected={selected} setSelected={setSelected} theme={theme} quality={resolvedQuality}/>
        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping
          dampingFactor={0.075}
          enablePan={viewport.width > 680}
          minDistance={2.2}
          maxDistance={26}
          maxPolarAngle={Math.PI / 1.95}
          minPolarAngle={0.08}
          target={[-0.8, 1.55, 0]}
          rotateSpeed={viewport.width <= 680 ? 0.72 : 0.9}
          zoomSpeed={viewport.width <= 680 ? 0.78 : 1}
        />
        <SceneCameraRig controlsRef={controlsRef} selected={selected} resetKey={resetKey} viewPreset={viewPreset}/>
      </Canvas>
    </div>
  );
}
