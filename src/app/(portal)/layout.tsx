import { Shell } from "@/components/Shell";
import MotionProviders from "@/components/motion/Providers";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <MotionProviders>
      <Shell>{children}</Shell>
    </MotionProviders>
  );
}
