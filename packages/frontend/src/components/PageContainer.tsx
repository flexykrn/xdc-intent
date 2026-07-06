import { ReactNode } from "react";

interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

export default function PageContainer({ children, className = "" }: PageContainerProps) {
  return (
    <div className={`relative z-10 min-h-[calc(100vh-180px)] py-8 sm:py-12 px-5 sm:px-8 lg:px-10 ${className}`}>
      <div className="max-w-[1200px] mx-auto">
        {children}
      </div>
    </div>
  );
}
