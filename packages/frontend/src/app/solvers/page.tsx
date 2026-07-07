import PageContainer from "@/components/PageContainer";
import { SectionHeader } from "@/components/ui";
import { SolverLeaderboard } from "@/components/SolverLeaderboard";

export const metadata = {
  title: "Solvers — XDCIntent",
  description: "Registered intent solvers and their fees",
};

export default function SolversPage() {
  return (
    <PageContainer>
      <SectionHeader
        eyebrow="Protocol"
        title="Solver Leaderboard"
        description="All solvers registered in the SolverRegistry, including fees and supported chains."
      />
      <SolverLeaderboard />
    </PageContainer>
  );
}
