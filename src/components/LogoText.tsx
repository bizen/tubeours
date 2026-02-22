export default function LogoText() {
    return (
        <span style={{ position: 'relative', display: 'inline-block' }}>
            tubeours
            <span style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%)',
                backgroundSize: '100% 4px',
                opacity: 0.4,
                pointerEvents: 'none',
            }} />
        </span>
    );
}
