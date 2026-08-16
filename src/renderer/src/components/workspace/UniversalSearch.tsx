import { useState } from 'react';
import { trpc } from '../../trpc';
import { Button } from '../ui/button';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '../ui/command';
import { FileCode, FileText, Search } from 'lucide-react';

const MAX_CONTENT_RESULTS = 4;

interface UniversalSearchProps {
  workspaceId: string;
  onOpenFile: (path: string) => void;
}

export const UniversalSearch = ({ workspaceId, onOpenFile }: UniversalSearchProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  const fileResults = trpc.workspace.searchFiles.useQuery(
    { workspaceId, query: query },
    { enabled: isOpen && query.length > 0 },
  );
  const contentResults = trpc.workspace.searchContent.useQuery(
    { workspaceId, query: query },
    { enabled: isOpen && query.length > 0 },
  );

  const files = fileResults.data?.files ?? [];
  const contentFiles = contentResults.data?.files ?? [];

  const isSearching = fileResults.isFetching || contentResults.isFetching;
  const hasResults = files.length > 0 || contentFiles.length > 0;

  function handleSelect(path: string) {
    onOpenFile(path);
    setIsOpen(false);
    setQuery('');
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="gap-2 font-mono text-ui-xs"
      >
        <Search className="h-3.5 w-3.5" strokeWidth={1.5} />
        search
      </Button>

      <CommandDialog open={isOpen} onOpenChange={setIsOpen}>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="search files and contents..."
        />
        <CommandList>
          {!isSearching && !hasResults && (
            <CommandEmpty>
              {query.length === 0 ? 'Type to search files and contents.' : 'No results found.'}
            </CommandEmpty>
          )}

          {query.length > 0 && isSearching && !hasResults && (
            <CommandEmpty>Searching...</CommandEmpty>
          )}

          {files.length > 0 && (
            <CommandGroup heading="Files">
              {files.map((path) => (
                <CommandItem
                  key={`file:${path}`}
                  value={`file:${path}`}
                  onSelect={() => handleSelect(path)}
                  className="gap-2 font-mono text-ui-xs"
                >
                  <FileText className="text-ink-500" strokeWidth={1.5} />
                  <span className="truncate">{path}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {files.length > 0 && contentFiles.length > 0 && (
            <CommandSeparator alwaysRender className="my-2" />
          )}

          {contentFiles.length > 0 && (
            <CommandGroup heading="Content">
              {contentFiles.map((file) => (
                <CommandItem
                  key={`content:${file.path}`}
                  value={`content:${file.path}`}
                  onSelect={() => handleSelect(file.path)}
                  className="flex-col items-start gap-1 font-mono text-ui-xs"
                >
                  <div className="flex w-full items-center gap-2">
                    <FileCode className="text-ink-500" strokeWidth={1.5} />
                    <span className="truncate">{file.path}</span>
                  </div>
                  {file.matches.slice(0, MAX_CONTENT_RESULTS).map((match, matchIndex) => (
                    <span key={matchIndex} className="w-full truncate pl-6 text-ink-400">
                      {match}
                    </span>
                  ))}
                  {file.matches.length > MAX_CONTENT_RESULTS && (
                    <span className="w-full truncate pl-6 text-ink-400">
                      + {file.matches.length - MAX_CONTENT_RESULTS} more matches
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
};
