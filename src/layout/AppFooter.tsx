const AppFooter: React.FC = () =>  {
  return (
    <footer className="w-full mt-8 py-6 px-4 border-t border-gray-200 dark:border-gray-800 text-center text-sm text-gray-500 dark:text-gray-400">
      <div>
        Built with <span className="text-red-500">♥</span> by{" "}
        <a
          href="https://github.com/alifianadexe"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-500 hover:underline"
        >
          Adexe
        </a>
      </div>
      <div className="mt-2">
        <span className="font-semibold">Donations:</span>
        <div className="flex flex-col items-center gap-1 mt-1">
         
          <span>
            <span className="font-medium">SUI:</span>{" "}
            <span className="font-mono">0x6940126d04e8b2b7931bb541608b9de258e882336526c839cb0f3190a678302e</span>
          </span>
        </div>
      </div>
    </footer>
  );
}

export default AppFooter;