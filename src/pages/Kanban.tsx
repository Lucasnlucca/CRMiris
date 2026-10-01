import { useEffect, useState } from 'react';
import { Plus, MoreVertical } from 'lucide-react';
import { databases } from '../lib/appwrite';
import { Query } from 'appwrite';
import { Task } from '../types';

const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'default';
const COLLECTION_ID = 'tasks';

export default function Kanban() {
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    loadTasks();
  }, []);

  async function loadTasks() {
    try {
      const { documents } = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [Query.orderDesc('created_at')]
      );
      if (documents) {
        const mapped = documents.map(d => ({
          ...d,
          id: d.$id,
          created_at: d.$createdAt,
        })) as unknown as Task[];
        setTasks(mapped);
      }
    } catch (error) {
      console.error('Error loading tasks:', error);
    }
  }

  const columns = [
    { id: 'todo', title: 'A Fazer', color: 'from-blue-500 to-blue-600' },
    { id: 'in_progress', title: 'Em Progresso', color: 'from-yellow-500 to-yellow-600' },
    { id: 'completed', title: 'Concluído', color: 'from-green-500 to-green-600' },
  ];

  const getTasksByStatus = (status: string) => tasks.filter((task) => task.status === status);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Kanban</h2>
        <button className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl shadow-sm transition-all flex items-center gap-2 text-sm font-medium">
          <Plus className="w-4 h-4" />
          Nova Tarefa
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {columns.map((column) => {
          const columnTasks = getTasksByStatus(column.id);
          return (
            <div key={column.id} className="flex flex-col">
              <div className={`bg-gradient-to-r ${column.color} rounded-t-2xl p-4`}>
                <div className="flex items-center justify-between text-white">
                  <h3 className="font-semibold text-sm">{column.title}</h3>
                  <span className="bg-white/20 px-2 py-0.5 rounded-lg text-xs font-medium">{columnTasks.length}</span>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-[#0d1117] rounded-b-2xl p-4 min-h-[500px] space-y-3 border-x border-b border-gray-200 dark:border-white/[0.08]">
                {columnTasks.map((task) => (
                  <div
                    key={task.id}
                    className="bg-white dark:bg-[#121824] rounded-xl p-4 shadow-sm border border-gray-200 dark:border-white/[0.08] hover:shadow-md transition-all cursor-move"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-medium text-gray-900 dark:text-white text-sm">{task.title}</h4>
                      <button className="p-1 hover:bg-gray-100 dark:hover:bg-white/[0.06] rounded transition-colors">
                        <MoreVertical className="w-4 h-4 text-gray-400" />
                      </button>
                    </div>
                    {task.description && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">{task.description}</p>
                    )}
                    {task.assignee && (
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-full flex items-center justify-center shadow-sm">
                          <span className="text-[10px] text-white font-medium">{task.assignee[0]}</span>
                        </div>
                        <span className="text-xs text-gray-600 dark:text-gray-400">{task.assignee}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
