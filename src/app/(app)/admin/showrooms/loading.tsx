export default function Loading() {
  return (
    <div className="space-y-4 font-sans text-xs animate-pulse">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-6 w-48 rounded bg-[#EAEAEA]" />
          <div className="h-3 w-80 rounded bg-[#EAEAEA]" />
        </div>
        <div className="h-8 w-28 rounded bg-[#EAEAEA]" />
      </div>

      <div className="rounded-xl border border-[#EAEAEA] bg-white p-6 space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-10 rounded bg-[#F7F7F5]" />
        ))}
      </div>
    </div>
  );
}
