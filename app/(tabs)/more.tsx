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
    ...(manager ? [["لوحة القيادة", "chart.bar.xaxis", "/manager"]] : []),
    ...(manager ? [["الموظفون", "person.2.fill", "/employees"], ["الرواتب", "banknote", "/payroll"], ["HR Tools", "banknote", "/hr-tools"]] : []),
    ...(teamAccess ? [["الجدول", "calendar", "/schedule"], ["التقارير", "chart.bar.fill", "/reports"]] : []),
    ...(manager ? [["الإعدادات", "settings", "/settings"]] : []),
    ["تسجيل الخروج", "logout", "/logout"],
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
  root:{flex:1},\n  homeButton:{position:"absolute",top:12,right:16,zIndex:50,flexDirection:"row",alignItems:"center",gap:6,paddingHorizontal:11,paddingVertical:8,borderRadius:12,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#DCE5EE",shadowColor:"#102A47",shadowOpacity:0.1,shadowRadius:8,shadowOffset:{width:0,height:3},elevation:4},\n  homeText:{color:"#163A63",fontSize:10,fontWeight:"900"},\n  page:{padding:22,paddingBottom:50,gap:20,maxWidth:760,width:"100%",alignSelf:"center"},
  header:{alignItems:"flex-end"},
  eyebrow:{fontSize:10,fontWeight:"900",letterSpacing:1,color:"#98A2B3"},
  title:{fontSize:28,fontWeight:"900",color:"#172033",marginTop:5,textAlign:"right"},
  subtitle:{fontSize:12,color:"#667085",marginTop:5,textAlign:"right"},
  grid:{gap:10},
  item:{minHeight:64,borderWidth:1,borderColor:"#E4E7EC",borderRadius:16,backgroundColor:"#FFFFFF",padding:12,flexDirection:"row-reverse",alignItems:"center",gap:12},
  icon:{width:40,height:40,borderRadius:12,backgroundColor:"#EEF4FB",alignItems:"center",justifyContent:"center"},
  label:{flex:1,fontSize:13,fontWeight:"800",color:"#172033",textAlign:"right"},
  chevron:{fontSize:20,color:"#98A2B3"},
  pressed:{opacity:.82,transform:[{scale:.99}]},
});