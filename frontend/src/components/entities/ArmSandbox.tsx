import React, { useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';

export default function ArmSandbox() {
    const sceneRef = useRef<HTMLDivElement>(null);
    const engineRef = useRef<Matter.Engine | null>(null);
    const renderRef = useRef<Matter.Render | null>(null);
    const mouseSpringRef = useRef<Matter.Constraint | null>(null);
    const elbowJointRef = useRef<Matter.Constraint | null>(null);

    // Tuning state
    const [springStiffness, setSpringStiffness] = useState(0.02);
    const [springDamping, setSpringDamping] = useState(0.1);
    const [gravityScale, setGravityScale] = useState(1.0);
    const [elbowStiffness, setElbowStiffness] = useState(1.0);

    useEffect(() => {
        if (!sceneRef.current) return;

        const Engine = Matter.Engine,
              Render = Matter.Render,
              Runner = Matter.Runner,
              Bodies = Matter.Bodies,
              Composite = Matter.Composite,
              Constraint = Matter.Constraint;

        const engine = Engine.create();
        engineRef.current = engine;
        engine.gravity.scale = 0.001 * gravityScale;

        const render = Render.create({
            element: sceneRef.current,
            engine: engine,
            options: {
                width: 800,
                height: 600,
                wireframes: false,
                background: '#222'
            }
        });
        renderRef.current = render;

        // Shoulder (static)
        const shoulder = Bodies.circle(400, 150, 15, { isStatic: true, render: { fillStyle: '#e74c3c' } });

        // Upper Arm (75px length)
        const upperArm = Bodies.rectangle(400, 200, 15, 75, { render: { fillStyle: '#3498db' } });
        
        // Lower Arm (73px length)
        const lowerArm = Bodies.rectangle(400, 280, 12, 73, { render: { fillStyle: '#2ecc71' } });

        // Shoulder Joint
        const shoulderJoint = Constraint.create({
            bodyA: shoulder,
            bodyB: upperArm,
            pointA: { x: 0, y: 0 },
            pointB: { x: 0, y: -37.5 }, // Top of upper arm
            stiffness: 1,
            length: 0,
            render: { visible: false }
        });

        // Elbow Joint
        const elbowJoint = Constraint.create({
            bodyA: upperArm,
            bodyB: lowerArm,
            pointA: { x: 0, y: 37.5 }, // Bottom of upper arm
            pointB: { x: 0, y: -36.5 }, // Top of lower arm
            stiffness: elbowStiffness,
            length: 0,
            render: { visible: false }
        });
        elbowJointRef.current = elbowJoint;

        // Mouse Spring (Wrist to Cursor)
        const mouseSpring = Constraint.create({
            bodyA: lowerArm,
            pointA: { x: 0, y: 36.5 }, // Bottom of lower arm (Wrist)
            pointB: { x: 400, y: 400 }, // Initial target
            stiffness: springStiffness,
            damping: springDamping,
            render: {
                strokeStyle: '#f1c40f',
                lineWidth: 2,
                type: 'spring'
            }
        });
        mouseSpringRef.current = mouseSpring;

        // Collision filtering so arm parts don't collide with each other
        const group = Matter.Body.nextGroup(true);
        upperArm.collisionFilter.group = group;
        lowerArm.collisionFilter.group = group;
        shoulder.collisionFilter.group = group;

        Composite.add(engine.world, [shoulder, upperArm, lowerArm, shoulderJoint, elbowJoint, mouseSpring]);

        Render.run(render);
        const runner = Runner.create();
        Runner.run(runner, engine);

        // Mouse move listener to update constraint target
        const handleMouseMove = (e: MouseEvent) => {
            if (!render.canvas) return;
            const bounds = render.canvas.getBoundingClientRect();
            const mouseX = e.clientX - bounds.left;
            const mouseY = e.clientY - bounds.top;
            
            // Only update if mouse is generally over the canvas area (optional bounds check)
            mouseSpring.pointB = { x: mouseX, y: mouseY };
        };

        window.addEventListener('mousemove', handleMouseMove);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            Render.stop(render);
            Runner.stop(runner);
            if (render.canvas) {
                render.canvas.remove();
            }
            Engine.clear(engine);
        };
    }, []); // Run once on mount

    // Update Matter engine when sliders change
    useEffect(() => {
        if (engineRef.current) {
            engineRef.current.gravity.scale = 0.001 * gravityScale;
        }
        if (mouseSpringRef.current) {
            mouseSpringRef.current.stiffness = springStiffness;
            mouseSpringRef.current.damping = springDamping;
        }
        if (elbowJointRef.current) {
            elbowJointRef.current.stiffness = elbowStiffness;
        }
    }, [springStiffness, springDamping, gravityScale, elbowStiffness]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: 'sans-serif', padding: '20px', color: '#fff', background: '#111', minHeight: '100vh' }}>
            <h2 style={{ margin: '0 0 20px 0' }}>Matter.js Arm Mechanics Sandbox</h2>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginBottom: '20px', background: '#222', padding: '15px', borderRadius: '8px', border: '1px solid #333' }}>
                <label style={{ display: 'flex', flexDirection: 'column', width: '200px' }}>
                    <span>Spring Stiffness: {springStiffness.toFixed(3)}</span>
                    <input type="range" min="0.001" max="0.2" step="0.001" value={springStiffness} onChange={e => setSpringStiffness(parseFloat(e.target.value))} />
                </label>
                
                <label style={{ display: 'flex', flexDirection: 'column', width: '200px' }}>
                    <span>Spring Damping: {springDamping.toFixed(3)}</span>
                    <input type="range" min="0.0" max="0.5" step="0.01" value={springDamping} onChange={e => setSpringDamping(parseFloat(e.target.value))} />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', width: '200px' }}>
                    <span>Gravity Scale: {gravityScale.toFixed(2)}</span>
                    <input type="range" min="0" max="3" step="0.1" value={gravityScale} onChange={e => setGravityScale(parseFloat(e.target.value))} />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', width: '200px' }}>
                    <span>Elbow Stiffness: {elbowStiffness.toFixed(2)}</span>
                    <input type="range" min="0.1" max="1" step="0.1" value={elbowStiffness} onChange={e => setElbowStiffness(parseFloat(e.target.value))} />
                </label>
            </div>

            <div ref={sceneRef} style={{ border: '2px solid #444', borderRadius: '4px', overflow: 'hidden' }} />
        </div>
    );
}
