export function Watermark() {
  return (
    <div
      aria-hidden="true"
      className="
        app-watermark pointer-events-none fixed bottom-3 right-4 z-30
        select-none text-right
      "
    >
      <div
        className="
          rounded-md px-3 py-2
          text-[11px] leading-tight
          text-gray-400
          opacity-70
        "
      >
        <div>สำหรับใช้งานภายในองค์กรเท่านั้น</div>
        <div className="text-[10px]">
          Internal Use Only
        </div>
        <div className="mt-0.5 text-[10px]">
          Developed by Rujipas Chorfah
        </div>
        <div className="text-[10px]">
          Senior Professional HRIS &amp; Shared Service • People Group
        </div>
      </div>
    </div>
  );
}
