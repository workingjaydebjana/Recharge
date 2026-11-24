export default function PortalLoading() {
  return (
    <div className="space-y-5 animate-pulse" aria-busy="true" aria-label="Loading page">
      <div className="space-y-2">
        <div className="h-7 w-48 rounded-xl bg-[#EAE7F5]" />
        <div className="h-3.5 w-72 max-w-full rounded-lg bg-[#F1EEF9]" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="h-36 rounded-3xl bg-[#EAE7F5]/80" />
        <div className="h-36 rounded-3xl bg-[#EAE7F5]/60" />
      </div>

      <div className="h-64 rounded-3xl bg-white border border-[#EAE7F5] p-5 space-y-3">
        <div className="h-5 w-40 rounded-lg bg-[#EAE7F5]" />
        <div className="h-10 w-full rounded-xl bg-[#F5F3FF]" />
        <div className="h-10 w-full rounded-xl bg-[#F5F3FF]" />
        <div className="h-10 w-2/3 rounded-xl bg-[#F5F3FF]" />
      </div>
    </div>
  );
}
