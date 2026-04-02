import React, { useEffect, useRef, useState } from 'react';
import { Settings2, Maximize2, Minimize2, RefreshCw } from 'lucide-react';
import { vertexShaderSource, fragmentShaderSource } from './Shader';

interface ShaderParams {
  yaw: number;
  pitch: number;
  roll: number;
  poly_U: number;
  poly_V: number;
  poly_W: number;
  poly_type: number;
  poly_zoom: number;
  inner_sphere: number;
  refr_index: number;
}

const defaultParams: ShaderParams = {
  yaw: 0.0,
  pitch: 0.0,
  roll: 0.0,
  poly_U: 1.0,
  poly_V: 0.5,
  poly_W: 1.0,
  poly_type: 3,
  poly_zoom: 2.0,
  inner_sphere: 1.0,
  refr_index: 0.9,
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [params, setParams] = useState<ShaderParams>(defaultParams);
  const [showUI, setShowUI] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const paramsRef = useRef(params);

  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl');
    if (!gl) {
      console.error('WebGL not supported');
      return;
    }

    // Compile shaders
    const compileShader = (source: string, type: number) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertexShader = compileShader(vertexShaderSource, gl.VERTEX_SHADER);
    const fragmentShader = compileShader(fragmentShaderSource, gl.FRAGMENT_SHADER);

    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      return;
    }

    gl.useProgram(program);

    // Setup full screen quad
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = [
      -1.0, -1.0,
       1.0, -1.0,
      -1.0,  1.0,
      -1.0,  1.0,
       1.0, -1.0,
       1.0,  1.0,
    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // Get uniform locations
    const locations = {
      iResolution: gl.getUniformLocation(program, 'iResolution'),
      iTime: gl.getUniformLocation(program, 'iTime'),
      yaw: gl.getUniformLocation(program, 'yaw'),
      pitch: gl.getUniformLocation(program, 'pitch'),
      roll: gl.getUniformLocation(program, 'roll'),
      poly_U: gl.getUniformLocation(program, 'poly_U'),
      poly_V: gl.getUniformLocation(program, 'poly_V'),
      poly_W: gl.getUniformLocation(program, 'poly_W'),
      poly_type: gl.getUniformLocation(program, 'poly_type'),
      poly_zoom: gl.getUniformLocation(program, 'poly_zoom'),
      inner_sphere: gl.getUniformLocation(program, 'inner_sphere'),
      refr_index: gl.getUniformLocation(program, 'refr_index'),
    };

    let animationFrameId: number;
    const startTime = performance.now();

    const render = () => {
      // Resize canvas to display size
      const displayWidth = canvas.clientWidth;
      const displayHeight = canvas.clientHeight;
      if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
      }

      const currentTime = (performance.now() - startTime) / 1000.0;

      // Set uniforms
      gl.uniform3f(locations.iResolution, gl.canvas.width, gl.canvas.height, 1.0);
      gl.uniform1f(locations.iTime, currentTime);
      
      const p = paramsRef.current;
      gl.uniform1f(locations.yaw, p.yaw);
      gl.uniform1f(locations.pitch, p.pitch);
      gl.uniform1f(locations.roll, p.roll);
      gl.uniform1f(locations.poly_U, p.poly_U);
      gl.uniform1f(locations.poly_V, p.poly_V);
      gl.uniform1f(locations.poly_W, p.poly_W);
      gl.uniform1i(locations.poly_type, p.poly_type);
      gl.uniform1f(locations.poly_zoom, p.poly_zoom);
      gl.uniform1f(locations.inner_sphere, p.inner_sphere);
      gl.uniform1f(locations.refr_index, p.refr_index);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      gl.deleteBuffer(positionBuffer);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!(navigator as any).requestMIDIAccess) {
      console.warn("Web MIDI API not supported in this browser.");
      return;
    }

    let midiAccess: any = null;

    const onMIDIMessage = (message: any) => {
      const [status, data1, data2] = message.data;
      // Status 176 (0xB0) is Control Change on Channel 1
      if (status === 176) {
        // Map MIDI value 0-127 to parameter range 0-5
        const mappedValue = (data2 / 127) * 5.0;
        if (data1 === 0) {
          setParams(prev => ({ ...prev, poly_U: mappedValue }));
        } else if (data1 === 1) {
          setParams(prev => ({ ...prev, poly_V: mappedValue }));
        } else if (data1 === 2) {
          setParams(prev => ({ ...prev, poly_W: mappedValue }));
        } else if (data1 === 16) {
          setParams(prev => ({ ...prev, yaw: ((data2 / 127) * 2 - 1) * Math.PI }));
        } else if (data1 === 17) {
          setParams(prev => ({ ...prev, pitch: ((data2 / 127) * 2 - 1) * Math.PI }));
        } else if (data1 === 18) {
          setParams(prev => ({ ...prev, roll: ((data2 / 127) * 2 - 1) * Math.PI }));
        }
      }
    };

    (navigator as any).requestMIDIAccess().then((access: any) => {
      midiAccess = access;
      
      const attachListeners = () => {
        for (const input of access.inputs.values()) {
          if (input.name && input.name.startsWith('nanoKONTROL')) {
            input.onmidimessage = onMIDIMessage;
          }
        }
      };

      attachListeners();

      access.onstatechange = (e: any) => {
        if (e.port.type === 'input' && e.port.state === 'connected') {
          attachListeners();
        }
      };
    }).catch((err: any) => {
      console.error("MIDI access denied or failed:", err);
    });

    return () => {
      if (midiAccess) {
        for (const input of midiAccess.inputs.values()) {
          input.onmidimessage = null;
        }
        midiAccess.onstatechange = null;
      }
    };
  }, []);

  const handleParamChange = (key: keyof ShaderParams, value: number) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black text-white font-sans">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block"
      />
      
      {/* Controls Overlay */}
      <div className={`absolute top-4 right-4 transition-transform duration-300 ${showUI ? 'translate-x-0' : 'translate-x-[120%]'}`}>
        <div className="bg-black/60 backdrop-blur-md border border-white/10 p-6 rounded-2xl w-80 shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium tracking-wide flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-blue-400" />
              Parameters
            </h2>
            <div className="flex gap-2">
              <button 
                onClick={() => setParams(defaultParams)}
                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                title="Reset to defaults"
              >
                <RefreshCw className="w-4 h-4 text-gray-400" />
              </button>
              <button 
                onClick={() => setShowUI(false)}
                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
              >
                <Minimize2 className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>

          <div className="space-y-5">
            <SliderControl 
              label="Yaw" 
              value={params.yaw} 
              min={-Math.PI} max={Math.PI} step={0.01} 
              onChange={(v) => handleParamChange('yaw', v)} 
            />
            <SliderControl 
              label="Pitch" 
              value={params.pitch} 
              min={-Math.PI} max={Math.PI} step={0.01} 
              onChange={(v) => handleParamChange('pitch', v)} 
            />
            <SliderControl 
              label="Roll" 
              value={params.roll} 
              min={-Math.PI} max={Math.PI} step={0.01} 
              onChange={(v) => handleParamChange('roll', v)} 
            />
            <SliderControl 
              label="Poly U" 
              value={params.poly_U} 
              min={0} max={5} step={0.1} 
              onChange={(v) => handleParamChange('poly_U', v)} 
            />
            <SliderControl 
              label="Poly V" 
              value={params.poly_V} 
              min={0} max={5} step={0.1} 
              onChange={(v) => handleParamChange('poly_V', v)} 
            />
            <SliderControl 
              label="Poly W" 
              value={params.poly_W} 
              min={0} max={5} step={0.1} 
              onChange={(v) => handleParamChange('poly_W', v)} 
            />
            <SliderControl 
              label="Poly Type" 
              value={params.poly_type} 
              min={2} max={5} step={1} 
              onChange={(v) => handleParamChange('poly_type', v)} 
            />
            <SliderControl 
              label="Poly Zoom" 
              value={params.poly_zoom} 
              min={0.1} max={5} step={0.1} 
              onChange={(v) => handleParamChange('poly_zoom', v)} 
            />
            <SliderControl 
              label="Inner Sphere" 
              value={params.inner_sphere} 
              min={0} max={2} step={0.05} 
              onChange={(v) => handleParamChange('inner_sphere', v)} 
            />
            <SliderControl 
              label="Refraction Index" 
              value={params.refr_index} 
              min={0.1} max={2.0} step={0.01} 
              onChange={(v) => handleParamChange('refr_index', v)} 
            />
          </div>
        </div>
      </div>

      {/* Floating Action Buttons */}
      <div className="absolute bottom-6 right-6 flex gap-3">
        {!showUI && (
          <button
            onClick={() => setShowUI(true)}
            className="bg-black/50 hover:bg-black/80 backdrop-blur-md border border-white/10 p-3 rounded-full shadow-lg transition-all"
            title="Show Settings"
          >
            <Settings2 className="w-5 h-5" />
          </button>
        )}
        <button
          onClick={toggleFullscreen}
          className="bg-black/50 hover:bg-black/80 backdrop-blur-md border border-white/10 p-3 rounded-full shadow-lg transition-all"
          title="Toggle Fullscreen"
        >
          {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
}

function SliderControl({ 
  label, 
  value, 
  min, 
  max, 
  step, 
  onChange 
}: { 
  label: string; 
  value: number; 
  min: number; 
  max: number; 
  step: number; 
  onChange: (val: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-xs text-gray-300 font-medium">
        <span>{label}</span>
        <span className="font-mono text-blue-300">{value.toFixed(step < 1 ? 2 : 0)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
      />
    </div>
  );
}
