export default function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M0 20C0 31.0457 8.95433 40 20 40C31.0457 40 40 31.0457 40 20C40 8.95433 31.0457 0 20 0C8.95433 0 0 8.95433 0 20Z" fill="url(#fll-gradient)"/>
      <path d="M14.4336 12.916H10.3135V17.8311H13.9033V20.8438H10.3135V29.5186H6V10H14.4336V12.916Z" fill="white"/>
      <path d="M19.7998 26.6025H24.2812V29.5186H15.4863V10H19.7998V26.6025Z" fill="white"/>
      <path d="M29.5186 26.6025H34V29.5186H25.2051V10H29.5186V26.6025Z" fill="white"/>
      <defs>
        <linearGradient id="fll-gradient" x1="6.5" y1="1.5" x2="34.5" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#312E81"/>
          <stop offset="1" stopColor="#0A0A1B"/>
        </linearGradient>
      </defs>
    </svg>
  );
}
