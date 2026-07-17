import { TwinWorkspaceLayout } from "@/components/TwinWorkspaceLayout";

export default function TwinWorkspaceRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TwinWorkspaceLayout>{children}</TwinWorkspaceLayout>;
}
