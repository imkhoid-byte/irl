import Link from "next/link";
import { Logo } from "@/components/ui";
import { ExperienceArt } from "@/components/experience-art";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <Link href="/" aria-label="ONCE home"><Logo /></Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">{children}</div>
      </div>
      <div className="relative hidden lg:block">
        <ExperienceArt category="music" className="absolute inset-0" />
        <div className="absolute inset-x-0 bottom-0 p-12 text-paper">
          <p className="display max-w-md text-[48px]">You don&apos;t match to talk. <em>You match to show up.</em></p>
        </div>
      </div>
    </div>
  );
}
