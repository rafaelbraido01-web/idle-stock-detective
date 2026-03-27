import { BarChart3, Box, DollarSign, FileSpreadsheet, GitCompareArrows, LayoutDashboard, Megaphone, Settings, Tag } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation } from 'react-router-dom';
import { usePageVisibility, type ToggleablePage } from '@/store/PageVisibilityContext';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

const navItems: Array<{ title: string; url: string; icon: any; toggleKey?: ToggleablePage }> = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { title: 'Produtos', url: '/produtos', icon: Box, toggleKey: 'produtos' },
  { title: 'Importações', url: '/importacoes', icon: FileSpreadsheet, toggleKey: 'importacoes' },
  { title: 'Comparação', url: '/comparacao', icon: GitCompareArrows, toggleKey: 'comparacao' },
  { title: 'Promoções', url: '/promocoes', icon: Tag, toggleKey: 'promocoes' },
  { title: 'Campanhas', url: '/campanhas', icon: Megaphone, toggleKey: 'campanhas' },
  { title: 'Preço de Mercado', url: '/preco-mercado', icon: DollarSign, toggleKey: 'preco-mercado' },
  { title: 'Configurações', url: '/configuracoes', icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { isPageVisible } = usePageVisibility();

  const visibleItems = navItems.filter(item => !item.toggleKey || isPageVisible(item.toggleKey));

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <div className="px-4 py-5">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-foreground" />
              <span className="text-sm font-semibold tracking-tight text-foreground">Estoque Monitor</span>
            </div>
          )}
          {collapsed && <BarChart3 className="h-5 w-5 text-foreground mx-auto" />}
        </div>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === '/'}
                      className="hover:bg-accent/50 transition-colors duration-150"
                      activeClassName="bg-accent text-foreground font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
