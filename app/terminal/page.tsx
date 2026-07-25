import TerminalEngine from "@/components/TerminalEngine";
import TerminalHealthBar from "@/components/TerminalHealthBar";

export default function TerminalPage() {
  return (
    <>
      <TerminalHealthBar />
      <TerminalEngine />
    </>
  );
}
