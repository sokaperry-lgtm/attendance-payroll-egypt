import { ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAppData } from "@/lib/app-data";

export default function MoreScreen() {
  const router = useRouter();
  const { role } = useAppData();
  const manager = role === "manager";
  const teamAccess = manager || role === "supervisor";

  const items = [
    ...(teamAccess ? [["الفريق", "person.2.fill", "/manager"]] : []),
    ...(manager ? [["الموظفون", "person.2.fill", "/employees"], ["الرواتب", "banknote", "/payroll"], ["HR Tools", "banknote", "/hr-tools"]] : []),
    ...(teamAccess ? [["الجدول", "calendar", "/schedule"], ["التقارير", "chart.bar.fill", "/reports"]] : []),
    ...(manager ? [["الإعدادات", "settings", "/settings"]] : []),
  ];

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>WORKSPACE</Text>
        <Text style={styles.title}>المزيد</Text>
        <Text style={styles.subtitle}>كل أدوات النظام في مكان واحد</Text>
      </View>
      <View style={styles.grid}>
        {items.map(([label, icon, path]) => (
          <Pressable key={label} onPress={() => router.push(path as never)} style={({pressed}) => [styles.item, pressed && styles.pressed]}>
            <View style={styles.icon}><IconSymbol name={icon as never} size={20} color="#163A63" /></View>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.chevron}>‹</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page:{22: 24,50: 24,20: 24,maxWidth:760,width:"100%",alignSelf:"center"},
  header:{alignItems:"flex-end"},
  eyebrow:{fontSize: 10,fontWeight:"900",letterSpacing:1,color:"#667085"},
  title:{fontSize: 26,fontWeight:"900",color:"#172033",5: 24,textAlign:"right"},
  subtitle:{fontSize: 12,color:"#667085",5: 24,textAlign:"right"},
  grid:{10: 24},
  item:{minHeight:64,borderWidth:1,borderColor:"#E4E7EC",borderRadius: 16,backgroundColor:"#FFFFFF",12: 24,flexDirection:"row-reverse",alignItems:"center",12: 24},
  icon:{width:40,height:40,borderRadius: 12,backgroundColor:"#EEF4FB",alignItems:"center",justifyContent:"center"},
  label:{flex:1,fontSize: 13,fontWeight:"800",color:"#172033",textAlign:"right"},
  chevron:{fontSize: 19,color:"#667085"},
  pressed:{opacity:.82,transform:[{scale:.99}]},
});