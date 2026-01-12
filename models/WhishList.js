import sequelize from "../config/database-config.js";
import { DataTypes } from "sequelize";
const StudnetWhishListSchema=sequelize.define('student_whishlist',{
    student_id:{
        type:DataTypes?.STRING,
        allowNull:false,
    },
    counsellor_id:{
           type:DataTypes?.STRING,
        allowNull:false,
    },
    wishlisted_at:{
      type:DataTypes?.DATE,
      defaultValue:DataTypes?.NOW
    },
    created_at:{
        type:DataTypes?.DATE,
        defaultValue:DataTypes?.DATE.NOW
    },
     updated_at:{
        type:DataTypes?.DATE,
    }
},{
    tableName:"student_whishlist",
    timestamps: false,
    underscored: true,
})
export default StudnetWhishListSchema;