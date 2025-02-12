export const LoadingPlaceholder = ({ 
  height = "44px", 
  width = "180px", 
  text = "Loading..." 
}: {
  height?: string;
  width?: string;
  text?: string;
}) => (
  <div style={{ height, width }} className="flex items-center justify-center">
    {text}
  </div>
);
