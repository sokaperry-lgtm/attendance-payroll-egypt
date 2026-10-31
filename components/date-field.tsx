import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { isCalendarDate, todayKey } from '@/lib/payroll';
import { latinDigits, normalizeCalendarDate } from '@/lib/date-input';

const months=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const weekdays=['أحد','إثنين','ثلاثاء','أربعاء','خميس','جمعة','سبت'];

/** Explicit labeled day/month/year inputs work identically on mobile and web. */
export function DateField({label,value,onChange,disabled=false,maxDate}:{label:string;value:string;onChange:(value:string)=>void;disabled?:boolean;maxDate?:string}) {
  const [open,setOpen]=useState(false);
  const [viewMonth,setViewMonth]=useState(todayKey().slice(0,7));
  const parts=value.split('-');
  const [year='',month='',day='']=parts;
  const canonical=normalizeCalendarDate(value);
  const valid=isCalendarDate(canonical) && (!maxDate || canonical<=maxDate);
  const complete=year.length===4 && month.length>0 && day.length>0;
  const shownYear=Number(viewMonth.slice(0,4)), shownMonth=Number(viewMonth.slice(5,7));
  const firstDay=new Date(Date.UTC(shownYear,shownMonth-1,1)).getUTCDay();
  const count=new Date(Date.UTC(shownYear,shownMonth,0)).getUTCDate();
  const cells=Array.from({length:Math.ceil((firstDay+count)/7)*7},(_,i)=>i-firstDay+1);
  const update=(index:number,input:string)=>{
    const next=[year,month,day];
    next[index]=latinDigits(input).replace(/[^0-9]/g,'').slice(0,index===0?4:2);
    onChange(next.join('-'));
  };
  const navigate=(delta:number)=>{
    const date=new Date(Date.UTC(shownYear,shownMonth-1+delta,1));
    if(date.getUTCFullYear()<1900 || date.getUTCFullYear()>9999) return;
    setViewMonth(date.toISOString().slice(0,7));
  };
  const choose=(date:string)=>{onChange(date);setOpen(false);};
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.inputs}>
      {([{index:2,label:'اليوم',placeholder:'31',width:2},{index:1,label:'الشهر',placeholder:'10',width:2},{index:0,label:'السنة',placeholder:'2026',width:4}] as const).map(part=><View key={part.index} style={[styles.part,part.index===0&&styles.year]}>
        <Text style={styles.partLabel}>{part.label}</Text>
        <TextInput accessibilityLabel={`${label} — ${part.label}`} style={[styles.input,disabled&&styles.disabled]} value={[year,month,day][part.index]} onChangeText={text=>update(part.index,text)} keyboardType="number-pad" maxLength={part.width} placeholder={part.placeholder} editable={!disabled} textAlign="center" />
      </View>)}
    </View>
    <Pressable accessibilityRole="button" accessibilityState={{expanded:open,disabled}} disabled={disabled} onPress={()=>{Keyboard.dismiss();if(!open) setViewMonth(valid?canonical.slice(0,7):todayKey().slice(0,7));setOpen(!open);}} style={styles.toggle}>
      <Text style={styles.toggleText}>{open?'إغلاق التقويم':'اختيار من التقويم'}</Text>
    </Pressable>
    {complete&&!valid ? <Text accessibilityRole="alert" style={styles.error}>{maxDate&&isCalendarDate(canonical)&&canonical>maxDate?'التاريخ لا يمكن أن يكون بعد اليوم.':'راجع اليوم والشهر والسنة؛ التاريخ غير صحيح.'}</Text>:null}
    {open&&!disabled?<View style={styles.calendar}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="الشهر السابق" onPress={()=>navigate(-1)} style={styles.arrow}><Text style={styles.toggleText}>‹</Text></Pressable>
        <Text style={styles.month}>{months[shownMonth-1]} {shownYear}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="الشهر التالي" onPress={()=>navigate(1)} style={styles.arrow}><Text style={styles.toggleText}>›</Text></Pressable>
      </View>
      <View style={styles.grid}>{weekdays.map(name=><View key={name} style={styles.cell}><Text style={styles.weekday}>{name}</Text></View>)}</View>
      <View style={styles.grid}>{cells.map((number,index)=>{
        const date=`${viewMonth}-${String(number).padStart(2,'0')}`;
        const outside=number<1||number>count;
        const unavailable=outside||Boolean(maxDate&&date>maxDate);
        const selected=!outside&&date===canonical;
        return <View key={index} style={styles.cell}>{outside?null:<Pressable accessibilityRole="button" accessibilityLabel={`${number} ${months[shownMonth-1]} ${shownYear}`} accessibilityState={{selected,disabled:unavailable}} disabled={unavailable} onPress={()=>choose(date)} style={[styles.day,selected&&styles.selected,unavailable&&styles.disabled]}><Text style={[styles.dayText,selected&&styles.selectedText]}>{number}</Text></Pressable>}</View>;
      })}</View>
      <Pressable accessibilityRole="button" style={styles.toggle} onPress={()=>choose(todayKey())}><Text style={styles.toggleText}>اختيار اليوم</Text></Pressable>
    </View>:null}
  </View>;
}
const styles=StyleSheet.create({
 field:{gap:6},label:{fontSize:11,fontWeight:'800',color:'#667085',textAlign:'right'},inputs:{flexDirection:'row-reverse',gap:8},part:{flex:1,gap:4},year:{flex:1.5},partLabel:{color:'#667085',fontSize:10,textAlign:'center'},input:{borderWidth:1,borderColor:'#D5DCE5',borderRadius:12,padding:12,color:'#172033',backgroundColor:'#FFF',fontSize:15,writingDirection:'ltr'},toggle:{padding:10,alignItems:'center'},toggleText:{color:'#163A63',fontSize:12,fontWeight:'800'},calendar:{borderWidth:1,borderColor:'#E4E7EC',borderRadius:14,padding:8,backgroundColor:'#FFF'},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},arrow:{padding:12},month:{color:'#163A63',fontWeight:'800',fontSize:14},grid:{flexDirection:'row',flexWrap:'wrap'},cell:{width:'14.285714%',alignItems:'center',justifyContent:'center',minHeight:38},weekday:{fontSize:9,color:'#667085'},day:{width:36,height:36,borderRadius:18,justifyContent:'center',alignItems:'center'},dayText:{fontSize:13,color:'#172033'},selected:{backgroundColor:'#163A63'},selectedText:{color:'#FFF',fontWeight:'800'},disabled:{opacity:0.4},error:{color:'#B42318',fontSize:11,textAlign:'right'},
});
