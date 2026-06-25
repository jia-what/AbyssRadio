export default function BreathingLight() {
  return (
    <div className="relative flex flex-col items-center cursor-pointer group p-3">
      <div className="w-px h-28 bg-gradient-to-b from-transparent via-blue-400/15 to-transparent group-hover:via-blue-400/30 transition-all duration-500" />
      <div className="absolute top-1/2 -translate-y-1/2">
        <div className="w-3 h-3 rounded-full bg-blue-400/40 animate-breathe shadow-[0_0_10px_rgba(96,165,250,0.3)] group-hover:shadow-[0_0_16px_rgba(96,165,250,0.5)] transition-all duration-500" />
      </div>
    </div>
  );
}
