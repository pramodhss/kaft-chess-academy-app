import { Filter, RotateCcw, X } from 'lucide-react';

export interface FilterSection {
  id: string;
  title: string;
  options: Array<{ value: string; label?: string; count?: number }>;
  selectedValues: string[];
  onChange: (values: string[]) => void;
  multiSelect?: boolean;
}

export function FilterModal({
  title = 'Filter Records',
  sections,
  totalResults,
  activeFilterCount,
  onResetAll,
  onClose,
}: Readonly<{
  title?: string;
  sections: FilterSection[];
  totalResults?: number;
  activeFilterCount: number;
  onResetAll: () => void;
  onClose: () => void;
}>) {
  const toggleOption = (section: FilterSection, val: string) => {
    if (!section.multiSelect) {
      if (section.selectedValues.includes(val)) {
        section.onChange([]);
      } else {
        section.onChange([val]);
      }
      return;
    }

    if (section.selectedValues.includes(val)) {
      section.onChange(section.selectedValues.filter(v => v !== val));
    } else {
      section.onChange([...section.selectedValues, val]);
    }
  };

  return (
    <div className="modal-backdrop items-end justify-center sm:items-center p-0 sm:p-4 z-50">
      <div
        role="dialog"
        aria-modal="true"
        className="modal-panel w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800"
        aria-labelledby="filter-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 flex items-center justify-center">
              <Filter size={16} />
            </div>
            <div>
              <h3 id="filter-modal-title" className="text-base font-bold text-gray-900 dark:text-white leading-tight">
                {title}
              </h3>
              {totalResults !== undefined && (
                <p className="text-xs text-gray-500 mt-0.5">
                  Showing {totalResults} matching record{totalResults === 1 ? '' : 's'}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800"
            aria-label="Close filter dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Filter Sections */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {sections.map(section => (
            <div key={section.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                  {section.title}
                </h4>
                {section.selectedValues.length > 0 && (
                  <button
                    type="button"
                    onClick={() => section.onChange([])}
                    className="text-[11px] font-semibold text-chess-blue hover:underline"
                  >
                    Clear ({section.selectedValues.length})
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {section.options.map(opt => {
                  const isSelected = section.selectedValues.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleOption(section, opt.value)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-navy text-white border-navy dark:bg-amber-500 dark:text-slate-950 dark:border-amber-500 shadow-sm'
                          : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-slate-750'
                      }`}
                    >
                      <span>{opt.label || opt.value}</span>
                      {opt.count !== undefined && (
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                            isSelected
                              ? 'bg-white/20 text-white dark:text-slate-950 dark:bg-black/20'
                              : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400'
                          }`}
                        >
                          {opt.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex items-center gap-3 bg-gray-50/50 dark:bg-slate-900/50">
          <button
            type="button"
            onClick={onResetAll}
            disabled={activeFilterCount === 0}
            className="flex items-center justify-center gap-1.5 py-2.5 px-4 text-xs font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-200/60 dark:hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-30"
          >
            <RotateCcw size={14} /> Reset All
          </button>
          <button
            type="button"
            onClick={onClose}
            className="primary-action flex-1 py-2.5 text-xs font-bold"
          >
            Apply Filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
