import CapitalGoalPanel from "@/components/CapitalGoalPanel";
import PortfolioEngine from "@/components/PortfolioEngine";

export default function PortfolioPage() {
  return (
    <>
      <div className="bg-slate-950 px-4 pt-8 sm:px-8">
        <div className="mx-auto max-w-[1500px]">
          <CapitalGoalPanel />
        </div>
      </div>
      <PortfolioEngine />
    </>
  );
}
